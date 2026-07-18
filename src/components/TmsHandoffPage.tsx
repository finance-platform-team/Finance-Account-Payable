import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Sparkles,
  Send,
  Loader as LoaderIcon,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react";
import { Cfm_tmshandoffsService } from "../generated/services/Cfm_tmshandoffsService";
import Loader from "./Loader";
import { buildTmsTaskUrl } from "../lib/tmsLinkBuilder";
import "../styles/CashFlowStatement.css";

interface TmsRow {
  cfm_tmshandoffid: string;
  cfm_tmscode?: string;
  cfm_decision?: string;
  cfm_tasktitle?: string;
  cfm_typeaction?: string;
  cfm_duedate?: string;
  cfm_sla?: string;
  cfm_progress?: number;
  cfm_priority?: number;
  createdon?: string;
  cfm_assigneename?: string;
  _cfm_taskstms_value?: string;
}

const PROGRESS_LABEL: Record<number, string> = {
  100000001: "In Progress",
  100000005: "On Hold",
  123200002: "Closed",
  123200003: "Cancelled",
  123200004: "New",
  123200005: "Submitted",
  931940001: "Rejected",
};

const STATUS_CLASS: Record<string, string> = {
  NEW: "st-new",
  SUBMITTED: "st-submitted",
  "IN PROGRESS": "st-inprogress",
  "ON HOLD": "st-onhold",
  CLOSED: "st-closed",
  CANCELLED: "st-cancelled",
  REJECTED: "st-rejected",
};

const STATUS_ORDER = [
  "All",
  "New",
  "Submitted",
  "In Progress",
  "On Hold",
  "Closed",
  "Cancelled",
  "Rejected",
];

const STATUS_INDICATOR_COLOR: Record<string, string> = {
  All: "var(--gold-dark)",
  New: "var(--warning)",
  Submitted: "var(--gold-dark)",
  "In Progress": "#3b82f6",
  "On Hold": "#8b5cf6",
  Closed: "var(--green-dark)",
  Cancelled: "var(--dim)",
  Rejected: "var(--danger)",
};

const STATUS_ICON: Record<string, typeof LayoutGrid> = {
  All: LayoutGrid,
  New: Sparkles,
  Submitted: Send,
  "In Progress": LoaderIcon,
  "On Hold": PauseCircle,
  Closed: CheckCircle2,
  Cancelled: XCircle,
  Rejected: Ban,
};

const PER_PAGE = 10;

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getSlaColor(dueDateStr?: string): string {
  if (!dueDateStr) return "var(--green-dark)";
  const due = new Date(dueDateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "var(--danger)";
  if (diffDays <= 2) return "var(--warning)";
  return "var(--green-dark)";
}

function getInitials(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export default function TmsHandoffPage() {
  const [rows, setRows] = useState<TmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [dueDateFilter, setDueDateFilter] = useState("");
  const [page, setPage] = useState(1);

  async function loadTasks() {
    setLoading(true);
    setError(null);
    try {
      const res = await Cfm_tmshandoffsService.getAll({
        select: [
          "cfm_tmshandoffid",
          "cfm_tmscode",
          "cfm_decision",
          "cfm_tasktitle",
          "cfm_typeaction",
          "cfm_duedate",
          "cfm_sla",
          "cfm_progress",
          "cfm_priority",
          "createdon",
          "_cfm_assignee_value",
          "_cfm_taskstms_value",
        ],
        orderBy: ["createdon desc"],
      });

const rawRows = (res.data || []) as unknown as Record<string, unknown>[];
      const mapped: TmsRow[] = rawRows.map((r) => ({
        cfm_tmshandoffid: r.cfm_tmshandoffid as string,
        cfm_tmscode: r.cfm_tmscode as string | undefined,
        cfm_decision: r.cfm_decision as string | undefined,
        cfm_tasktitle: r.cfm_tasktitle as string | undefined,
        cfm_typeaction: r.cfm_typeaction as string | undefined,
        cfm_duedate: r.cfm_duedate as string | undefined,
        cfm_sla: r.cfm_sla as string | undefined,
        cfm_progress: r.cfm_progress as number | undefined,
        cfm_priority: r.cfm_priority as number | undefined,
        createdon: r.createdon as string | undefined,
        cfm_assigneename: r[
          "_cfm_assignee_value@OData.Community.Display.V1.FormattedValue"
        ] as string | undefined,
        _cfm_taskstms_value: r._cfm_taskstms_value as string | undefined,
      }));
      const withLink = rawRows.filter((r) => r._cfm_taskstms_value);
      console.log(`Found ${withLink.length} tasks WITH a linked TMS task out of ${rawRows.length} total.`);
      if (withLink.length > 0) {
        console.log("Example linked task:", JSON.stringify(withLink[0], null, 2));
      }
      setRows(mapped);

    } catch (err) {
      console.error("Error loading TMS tasks:", err);
      setError("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTasks();
  import("../generated/services/AppmodulesService").then(({ AppmodulesService }) => {
    AppmodulesService.get("918476f7-7f6e-f111-ab0c-000d3ac2559d").then((res) => {
      console.log("Known working App:", JSON.stringify(res.data, null, 2));
    });
  });
}, []);

  const withStatus = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        statusStr: PROGRESS_LABEL[r.cfm_progress as number] || "New",
      })),
    [rows]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: withStatus.length };
    STATUS_ORDER.slice(1).forEach((s) => (counts[s] = 0));
    withStatus.forEach((r) => {
      counts[r.statusStr] = (counts[r.statusStr] || 0) + 1;
    });
    return counts;
  }, [withStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withStatus.filter((r) => {
      const matchStatus = statusFilter === "All" || r.statusStr === statusFilter;
      const matchSearch =
        !q ||
        (r.cfm_tasktitle || "").toLowerCase().includes(q) ||
        (r.cfm_tmscode || "").toLowerCase().includes(q) ||
        (r.cfm_typeaction || "").toLowerCase().includes(q) ||
        (r.cfm_assigneename|| "").toLowerCase().includes(q);
      const matchStart =
        !startDateFilter || (r.createdon && r.createdon.slice(0, 10) >= startDateFilter);
      const matchDue =
        !dueDateFilter || (r.cfm_duedate && r.cfm_duedate.slice(0, 10) <= dueDateFilter);
      return matchStatus && matchSearch && matchStart && matchDue;
    });
  }, [withStatus, statusFilter, search, startDateFilter, dueDateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PER_PAGE;
  const pageRows = filtered.slice(pageStart, pageStart + PER_PAGE);

  if (loading) {
    return (
      <div className="cfs-root">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cfs-root">
        <div className="cfs-error">{error}</div>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="btn btn-outline" onClick={loadTasks}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cfs-root">
      <div className="cfs-header">
        <div>
          <div className="cfs-eyebrow">Treasury Management</div>
          <div className="cfs-title">TMS Hand Off</div>
        </div>
        <button className="btn btn-outline" onClick={loadTasks}>
          <RefreshCw size={13} /> Refresh Data
        </button>
      </div>

      <div className="filters-bar">
        <div className="filters-row">
          <div className="filter-group">
            <span className="filter-lbl">Start Date</span>
            <input
              type="date"
              className="field-input tbl-date-input"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="filter-group">
            <span className="filter-lbl">Due Date</span>
            <input
              type="date"
              className="field-input tbl-date-input"
              value={dueDateFilter}
              onChange={(e) => {
                setDueDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="search-box" style={{ marginLeft: "auto" }}>
            <Search size={13} style={{ color: "var(--dim)" }} />
            <input
              type="text"
              placeholder="Search Tasks…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      <div className="tms-status-cards">
        {STATUS_ORDER.map((s) => {
          const Icon = STATUS_ICON[s];
          const color = STATUS_INDICATOR_COLOR[s];
          return (
            <button
              key={s}
              className={`tms-status-card${statusFilter === s ? " active" : ""}`}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              <Icon
                size={14}
                className="tms-status-icon"
                style={{ color: statusFilter === s ? "#fff" : color }}
              />
              <div className="tms-status-count">{statusCounts[s] || 0}</div>
              <div className="tms-status-label">{s}</div>
            </button>
          );
        })}
      </div>

      <div className="tms-table-wrap">
        <table className="tms-table">
          <colgroup>
            <col style={{ width: "72px" }} />
            <col style={{ width: "90px" }} />
            <col />
            <col style={{ width: "120px" }} />
            <col style={{ width: "210px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "70px" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Decision ID</th>
              <th>Task Title</th>
              <th>Type / Action</th>
              <th>Assignee</th>
              <th>SLA / Due</th>
              <th>Status</th>
              <th>Sent</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="tms-empty">
                  No tasks match the current filter.
                </td>
              </tr>
            ) : (
              pageRows.map((t) => {
                const slaColor = getSlaColor(t.cfm_duedate);
                const stCls = STATUS_CLASS[t.statusStr.toUpperCase()] || "st-new";
                return (
                  <tr key={t.cfm_tmshandoffid}>
                    <td className="tms-mono tms-ellipsis">{t.cfm_tmscode || "—"}</td>
                    <td className="tms-decision tms-ellipsis">{t.cfm_decision || "—"}</td>
                    <td className="tms-title tms-ellipsis">{t.cfm_tasktitle}</td>
                    <td className="tms-muted-italic tms-ellipsis">{t.cfm_typeaction || "—"}</td>
                   <td>
                      <div className="tms-assignee">
                        <div className="tms-avatar">{getInitials(t.cfm_assigneename)}</div>
                        <span
                          className="tms-assignee-name"
                          title={t.cfm_assigneename || "Unassigned"}
                        >
                          {t.cfm_assigneename || "Unassigned"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ color: slaColor, fontWeight: 700, fontFamily: "var(--mono)" }}>
                          <Clock size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          {t.cfm_sla || "—"}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--dim)" }}>
                          {formatDate(t.cfm_duedate)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`st-badge ${stCls}`}>
                        <span className="st-dot"></span>
                        {t.statusStr}
                      </span>
                    </td>
                    <td className="tms-mono">{formatDate(t.createdon)}</td>
       <td>
                      <button
                        className="view-btn"
                      onClick={() => {
                          // نفتح تاب فاضي فورًا وقت الكليك عشان المتصفح ميعتبروش Popup محجوب
                          const newTab = window.open("", "_blank");
                          buildTmsTaskUrl(t._cfm_taskstms_value).then((url) => {
                            console.log("Generated TMS URL:", url);
                            if (url && newTab) {
                              newTab.location.href = url;
                            } else if (newTab) {
                              newTab.close();
                              console.warn("No TMS link available for this task.");
                            }
                          });
                        
                        
                        }
                      }
                        
                      >
                        <Eye size={11} /> View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="tms-pagination">
            <span className="tms-pg-info">
              Showing <strong>{pageStart + 1}</strong>–
              <strong>{Math.min(pageStart + PER_PAGE, filtered.length)}</strong> of{" "}
              <strong>{filtered.length}</strong> tasks
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                className="tms-pg-btn"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(0, 7)
                .map((p) => (
                  <button
                    key={p}
                    className={`tms-pg-btn${p === currentPage ? " active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
              <button
                className="tms-pg-btn"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}