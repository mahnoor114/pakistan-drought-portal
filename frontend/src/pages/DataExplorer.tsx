import { useEffect, useMemo, useState } from "react";
import { api, type CatalogTable, type DataPage } from "../api";
import { fmt } from "../colors";

const OPS = { eq: "=", ne: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", like: "contains" } as const;
type Op = keyof typeof OPS;
interface Filter { column: string; op: Op; value: string }

function cell(v: any) {
  if (v === null || v === undefined) return <span className="muted">–</span>;
  if (typeof v === "number") return Number.isInteger(v) ? v : fmt(v, 3);
  const s = String(v);
  return s.length > 80 ? <span title={s}>{s.slice(0, 80)}…</span> : s;
}

export function DataExplorer() {
  const [tables, setTables] = useState<CatalogTable[]>([]);
  const [schema, setSchema] = useState("");
  const [search, setSearch] = useState("");
  const [table, setTable] = useState<string>("pakistan_drought_monthly_district");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [order, setOrder] = useState<{ col: string; desc: boolean } | null>(null);
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<DataPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.catalog().then((c) => {
      setTables(c.tables);
      setSchema(c.schema);
    });
  }, []);

  const info = tables.find((x) => x.table_name === table);
  const params = useMemo(() => {
    const p = new URLSearchParams();
    filters.filter((f) => f.column && f.value !== "").forEach((f) => p.append("filter", `${f.column}:${f.op}:${f.value}`));
    if (order) {
      p.set("order", order.col);
      if (order.desc) p.set("desc", "true");
    }
    return p;
  }, [filters, order]);

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set("limit", String(pageSize));
    p.set("offset", String(offset));
    setLoading(true);
    api
      .data(table, p)
      .then((d) => {
        setPage(d);
        setError("");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [table, params, pageSize, offset]);

  const groups = useMemo(() => {
    const s = search.toLowerCase();
    const g: Record<string, CatalogTable[]> = {};
    for (const x of tables) {
      if (s && !`${x.table_name} ${x.description} ${x.source}`.toLowerCase().includes(s)) continue;
      (g[x.group] ??= []).push(x);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [tables, search]);

  const pick = (name: string) => {
    setTable(name);
    setFilters([]);
    setOrder(null);
    setOffset(0);
  };
  const setFilter = (i: number, f: Partial<Filter>) => {
    setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, ...f } : x)));
    setOffset(0);
  };
  const totalRows = tables.reduce((s, x) => s + (x.rows ?? 0), 0);
  const cols = info?.column_list ?? page?.columns ?? [];

  return (
    <div className="explorer">
      <section className="panel">
        <h2>Database tables</h2>
        <p className="muted">
          PostgreSQL schema <b>{schema}</b> · {tables.length} tables · {fmt(totalRows)} rows
        </p>
        <input className="text" placeholder="Search tables…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="table-list">
          {groups.map(([g, xs]) => (
            <div key={g}>
              <div className="group-title">{g}</div>
              {xs.map((x) => (
                <button key={x.table_name} className={x.table_name === table ? "active" : ""} onClick={() => pick(x.table_name)}>
                  <span>{x.table_name}</span>
                  <span className="muted">{x.rows === null ? "" : fmt(x.rows)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="panel data-panel">
        <div className="row">
          <h2 className="grow">{table}</h2>
          <a className="play" href={`/api/data/${table}/csv?${params}`} download>⬇ Download CSV{filters.length ? " (filtered)" : ""}</a>
        </div>
        {info && (
          <p className="muted">
            {info.description && <>{info.description} · </>}
            {info.source && <>source: <code>{info.source}</code> · </>}
            {info.columns} columns
          </p>
        )}

        <div className="filters">
          {filters.map((f, i) => (
            <div className="row" key={i}>
              <select value={f.column} onChange={(e) => setFilter(i, { column: e.target.value })}>
                {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as Op })}>
                {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input className="text" value={f.value} placeholder="value (null for empty)" onChange={(e) => setFilter(i, { value: e.target.value })} />
              <button className="link" onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}>remove</button>
            </div>
          ))}
          <button className="link" onClick={() => setFilters((fs) => [...fs, { column: cols[0]?.name ?? "", op: "eq", value: "" }])}>
            + add filter
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {page && (
          <>
            <div className="row pager">
              <span className="muted">
                {fmt(page.total)} rows{loading ? " · loading…" : ""} · showing {page.total ? offset + 1 : 0}–{Math.min(offset + pageSize, page.total)}
              </span>
              <button className="link" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>← prev</button>
              <button className="link" disabled={offset + pageSize >= page.total} onClick={() => setOffset(offset + pageSize)}>next →</button>
              <select value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setOffset(0); }}>
                {[50, 100, 500, 1000].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </div>
            <div className="data-scroll">
              <table className="grid">
                <thead>
                  <tr>
                    {page.columns.map((c) => (
                      <th key={c.name} title={`${c.type} – click to sort`} onClick={() => setOrder((o) => ({ col: c.name, desc: o?.col === c.name ? !o.desc : false }))}>
                        {c.name}
                        {order?.col === c.name ? (order.desc ? " ▼" : " ▲") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r, i) => (
                    <tr key={i}>{page.columns.map((c) => <td key={c.name}>{cell(r[c.name])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="note">
          Every table is also available from the API: <code>/api/data/{table}?filter=column:op:value&amp;order=column&amp;limit=100</code>{" "}
          and <code>/api/data/{table}/csv</code>. API docs: <a className="link" href="/docs" target="_blank" rel="noreferrer">/docs</a>.
        </p>
      </section>
    </div>
  );
}
