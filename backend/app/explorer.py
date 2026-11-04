"""Generic data explorer: browse, filter and download every table in the drought schema.

Table and column names are checked against the database catalogue before they are used in SQL;
filter values are always bound parameters.
"""

import re
import tempfile

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from .db import SCHEMA, columns, engine, q, records, t, tables

router = APIRouter(prefix="/api")

OPS = {"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<=", "like": "ILIKE"}
MAX_LIMIT = 5000


def group_of(source: str, table: str) -> str:
    s = (source or "").replace("\\", "/")
    if table.startswith("portal_"):
        return "Portal (derived)"
    if table.startswith("grid_"):
        return "Gridded rasters"
    if table in ("table_catalog", "file_catalog"):
        return "Catalogues"
    m = re.search(r"csv/alternatives/([^/]+)/", s)
    if m:
        return f"Alternatives · {m.group(1)}"
    m = re.search(r"csv/([^/]+)/", s)
    if m:
        return {"open_api": "Open APIs", "from_rasters": "From rasters", "modis": "MODIS", "indices": "Drought indices",
                "projections": "Projections", "landcover": "Land cover", "boundaries": "Boundaries"}.get(m.group(1),
                                                                                                   m.group(1))
    if "boundary" in s:
        return "Boundaries"
    return "Master & other"


@router.get("/catalog")
def catalog():
    cat = q(f"SELECT table_name, rows, columns, source, description, loaded_at FROM {t('table_catalog')} "
            f"ORDER BY table_name")
    known = set(cat.table_name)
    extra = [{"table_name": n, "rows": None, "columns": len(c), "source": "", "description": "", "loaded_at": None}
             for n, c in tables().items() if n not in known]
    rows = records(cat) + extra
    for r in rows:
        r["group"] = group_of(r["source"], r["table_name"])
        r["column_list"] = [{"name": k, "type": v} for k, v in columns(r["table_name"]).items()]
    return {"schema": SCHEMA, "tables": rows}


def check_table(table):
    if table not in tables():
        raise HTTPException(404, f"unknown table '{table}'")
    return columns(table)


def where_clause(cols, filters):
    """filter strings 'column:op:value' -> (SQL, params)."""
    parts, params = [], {}
    for i, f in enumerate(filters or []):
        try:
            col, op, val = f.split(":", 2)
        except ValueError:
            raise HTTPException(400, f"bad filter '{f}', use column:op:value")
        if col not in cols or op not in OPS:
            raise HTTPException(400, f"bad filter '{f}'")
        if op == "like":
            parts.append(f'"{col}"::text ILIKE :p{i}')
            params[f"p{i}"] = f"%{val}%"
        elif val == "null" and op in ("eq", "ne"):
            parts.append(f'"{col}" IS {"" if op == "eq" else "NOT "}NULL')
        else:
            parts.append(f'"{col}" {OPS[op]} CAST(:p{i} AS {sql_type(cols[col])})')
            params[f"p{i}"] = val
    return ("WHERE " + " AND ".join(parts)) if parts else "", params


def sql_type(data_type):
    return {"bigint": "bigint", "integer": "integer", "double precision": "double precision", "real": "real",
            "boolean": "boolean", "timestamp without time zone": "timestamp"}.get(data_type, "text")


def order_clause(cols, order, desc):
    if not order:
        return ""
    if order not in cols:
        raise HTTPException(400, f"unknown column '{order}'")
    return f'ORDER BY "{order}" {"DESC" if desc else "ASC"} NULLS LAST'


@router.get("/data/{table}")
def data(table: str, limit: int = Query(100, ge=1, le=MAX_LIMIT), offset: int = Query(0, ge=0),
         order: str | None = None, desc: bool = False, filter: list[str] | None = Query(None),
         columns_: str | None = Query(None, alias="columns")):
    cols = check_table(table)
    pick = [c for c in (columns_.split(",") if columns_ else cols) if c]
    for c in pick:
        if c not in cols:
            raise HTTPException(400, f"unknown column '{c}'")
    where, params = where_clause(cols, filter)
    total = q(f"SELECT count(*) AS n FROM {t(table)} {where}", **params).n.iloc[0]
    sel = ", ".join(f'"{c}"' for c in pick)
    df = q(f"SELECT {sel} FROM {t(table)} {where} {order_clause(cols, order, desc)} LIMIT :lim OFFSET :off",
           **params, lim=limit, off=offset)
    return {"table": table, "total": int(total), "limit": limit, "offset": offset,
            "columns": [{"name": c, "type": cols[c]} for c in pick], "rows": records(df)}


@router.get("/data/{table}/distinct/{column}")
def distinct(table: str, column: str, limit: int = Query(300, le=2000)):
    cols = check_table(table)
    if column not in cols:
        raise HTTPException(400, f"unknown column '{column}'")
    df = q(f'SELECT DISTINCT "{column}" AS v FROM {t(table)} ORDER BY 1 LIMIT :lim', lim=limit)
    return {"values": [r["v"] for r in records(df)]}


@router.get("/data/{table}/csv")
def download(table: str, order: str | None = None, desc: bool = False, filter: list[str] | None = Query(None)):
    """All matching rows as CSV, streamed from PostgreSQL COPY."""
    cols = check_table(table)
    where, params = where_clause(cols, filter)
    sql = f"SELECT * FROM {t(table)} {where} {order_clause(cols, order, desc)}"
    tmp = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024, mode="w+b")
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        # SQLAlchemy-style :name params -> psycopg2 %(name)s, then let psycopg2 quote the values
        inner = cur.mogrify(re.sub(r":(p\d+)", r"%(\1)s", sql), params).decode()
        cur.copy_expert(f"COPY ({inner}) TO STDOUT WITH (FORMAT csv, HEADER true)", tmp)
    finally:
        raw.close()
    tmp.seek(0)

    def chunks():
        try:
            while block := tmp.read(1 << 20):
                yield block
        finally:
            tmp.close()

    return StreamingResponse(chunks(), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{table}.csv"'})
