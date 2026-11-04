"""PostgreSQL access. All portal data lives in schema "drought" (loaded by load_to_postgres.py).

Connection settings come from environment variables, or from portal/backend/.env:
PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, DROUGHT_SCHEMA.
"""
import math
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL


def _load_env_file():
    f = Path(__file__).resolve().parents[1] / ".env"
    if not f.exists():
        return
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] == '"':  # quoted: keep inner spaces exactly
                v = v[1:-1]
            os.environ.setdefault(k.strip(), v)


_load_env_file()

SCHEMA = os.environ.get("DROUGHT_SCHEMA", "drought")
engine = create_engine(
    URL.create("postgresql+psycopg2",
               username=os.environ.get("PGUSER", "postgres"),
               password=os.environ.get("PGPASSWORD"),
               host=os.environ.get("PGHOST", "localhost"),
               port=int(os.environ.get("PGPORT", 5432)),
               database=os.environ.get("PGDATABASE", "landslide portal 2 ")),  # the name ends with a space
    pool_pre_ping=True, pool_size=5, max_overflow=10)


def t(name):
    """Fully qualified, quoted table name (name must come from code or the catalog, never raw input)."""
    return f'"{SCHEMA}"."{name}"'


def q(sql, **params) -> pd.DataFrame:
    with engine.connect() as c:
        return pd.read_sql(text(sql), c, params=params)


def scalar(sql, **params):
    with engine.connect() as c:
        return c.execute(text(sql), params).scalar()


@lru_cache
def tables() -> dict[str, dict[str, str]]:
    """{table: {column: data_type}} for every table in the schema (cached)."""
    df = q("SELECT table_name, column_name, data_type FROM information_schema.columns "
           "WHERE table_schema = :s ORDER BY table_name, ordinal_position", s=SCHEMA)
    out: dict[str, dict[str, str]] = {}
    for r in df.itertuples():
        out.setdefault(r.table_name, {})[r.column_name] = r.data_type
    return out


def columns(table) -> dict[str, str]:
    return tables().get(table, {})


def clean(values):
    """NaN/inf -> None so the JSON is valid."""
    return [None if v is None or (isinstance(v, float) and not math.isfinite(v)) else
            (round(v, 4) if isinstance(v, float) else v) for v in values]


def records(df):
    df = df.replace([np.inf, -np.inf], np.nan).astype(object).where(df.notna(), None)
    return df.to_dict(orient="records")
