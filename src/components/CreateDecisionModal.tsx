import { useEffect, useState } from "react";
import { ClipboardCheck, X, Check } from "lucide-react";
import { Cfm_tmshandoffsService } from "../generated/services/Cfm_tmshandoffsService";
import type { Cfm_tmshandoffsBase } from "../generated/models/Cfm_tmshandoffsModel";
import AssigneeLookup from "./AssigneeLookup";
import { useToast } from "../lib/ToastContext";
import { computeDecisionSla } from "../lib/decisionSla";
interface CreateDecisionModalProps {
  open: boolean;
  sectionName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Priority = "" | "Low" | "Medium" | "High" | "Critical";

const PRIORITY_MAP: Record<Exclude<Priority, "">, number> = {
  Low: 123200000,
  Medium: 123200001,
  High: 123200002,
  Critical: 931940001,
};

function resolveFromWhere(section: string): number | undefined {
  if (
    [
      "Cash Flow Statement",
      "Operating Activities",
      "Investing Activities",
      "Financing Activities",
    ].includes(section)
  ) {
    return 1;
  }
  if (section.includes("Treasury Req") || section.includes("Request Budget")) {
    return 2;
  }
  if (section.includes("Treasury Submit")) {
    return 3;
  }
  if (
    section.includes("AP Planning") ||
    section.includes("AP to AP") ||
    section === "Accounts Payable"
  ) {
    return 4;
  }
  if (section.includes("AR")) {
    return 5;
  }
  return undefined;
}

function todayIso(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDisplayDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => isNaN(p))) return "";
  const [y, m, d] = parts;
  return `${d} ${MONTH_ABBR[m - 1]} ${y}`;
}

export default function CreateDecisionModal({
  open,
  sectionName,
  onClose,
  onSuccess,
}: CreateDecisionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null);
  const [priority, setPriority] = useState<Priority>("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { showToast } = useToast();
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle("");
      setDescription("");
      setAction("");
      setAssignee(null);
      setPriority("");
      setDueDate("");
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const start = todayIso();

  async function handleSubmit() {
    if (!title.trim()) {
      setErrorMsg("Please enter a title for the decision task.");
      return;
    }
    if (!assignee) {
      setErrorMsg("Please select an assignee for the decision task.");
      return;
    }
    if (!dueDate) {
      setErrorMsg("Please select a due date for the decision task.");
      return;
    }
    const todayD = new Date();
    todayD.setHours(0, 0, 0, 0);
    const dueD = new Date(dueDate + "T00:00:00");
    if (isNaN(dueD.getTime()) || dueD < todayD) {
      setErrorMsg("Due date must be today or a future date.");
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const sla = computeDecisionSla(start, dueDate);

      const fromWhere = resolveFromWhere(sectionName);

      const record: Partial<Cfm_tmshandoffsBase> = {
        cfm_tasktitle: title.trim(),
        cfm_taskdescription: description.trim(),
        cfm_typeaction: action.trim() || "Decision Action",
        cfm_duedate: `${dueDate}T00:00:00Z`,
        cfm_progress: 123200004,
        cfm_sla: sla,
        "cfm_Assignee@odata.bind": `/systemusers(${assignee!.id})`,
      };
      if (priority) record.cfm_priority = PRIORITY_MAP[priority] as never;
      if (fromWhere !== undefined) record.cfm_decisionfromwhere = fromWhere as never;

      await Cfm_tmshandoffsService.create(
        record as unknown as Omit<Cfm_tmshandoffsBase, "cfm_tmshandoffid">
      );

showToast(
        "Task Decision Sent",
        `Decision sent to TMS · Assignee: ${assignee!.name}.`,
        "success"
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error creating record in Dynamics:", err);
      setErrorMsg("Could not save decision task to Dataverse.");
      showToast("Error", "Could not save decision task to Dataverse.", "alert");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: "var(--gold-soft)",
                borderRadius: "var(--r-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
           >
              <ClipboardCheck size={18} style={{ color: "var(--gold-dark)" }} />
            </div>
            <div>
              <div className="modal-title">Create Task Decision</div>
              <div className="modal-sub">{sectionName}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {errorMsg && (
            <div
              style={{
                background: "var(--danger-soft)",
                color: "var(--danger)",
                padding: "10px 12px",
                borderRadius: "var(--r-md)",
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              {errorMsg}
            </div>
          )}

          <div className="form-field">
            <label className="field-lbl" htmlFor="td-title">
              Title <span className="field-req">*</span>
            </label>
            <input
              className="field-input"
              id="td-title"
              type="text"
              placeholder="Enter decision title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-lbl" htmlFor="td-desc">
              Description
            </label>
            <textarea
              className="field-input"
              id="td-desc"
              rows={3}
              style={{ resize: "vertical" }}
              placeholder="Describe the decision or action required…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-lbl" htmlFor="td-action">
              Action to be Taken
            </label>
            <input
              className="field-input"
              id="td-action"
              type="text"
              placeholder="Enter action to be taken…"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-lbl" htmlFor="td-assignee">
              Assignee <span className="field-req">*</span>
            </label>
            <AssigneeLookup value={assignee} onChange={setAssignee} />
          </div>

          <div className="form-field">
            <label className="field-lbl" htmlFor="td-priority">
              Priority
            </label>
            <div className="select-wrap" style={{ display: "block" }}>
              <select
                className="field-input"
                id="td-priority"
                style={{ paddingRight: 32 }}
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="">Select priority...</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <span className="sel-arrow">▾</span>
            </div>
          </div>

          <div className="form-2col">
            <div className="form-field">
              <label className="field-lbl" htmlFor="td-start">
                Start Date
              </label>
              <input
                className="field-input"
                id="td-start"
                type="text"
                readOnly
                disabled
value={formatDisplayDate(start)}                style={{ color: "var(--muted)", background: "var(--canvas)", fontWeight: 600 }}
              />
            </div>
      <div className="form-field">
              <label className="field-lbl" htmlFor="td-due">
                Due Date <span className="field-req">*</span>
              </label>
              <div className="date-field-wrap">
                <input
                  className="field-input date-native-input"
                  id="td-due"
                  type="date"
                  min={start}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <div className="date-display">
                  {dueDate ? formatDisplayDate(dueDate) : "Select due date..."}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
            style={{ background: "var(--gold-dark)" }}
          >
         <Check size={13} />
            {submitting ? "Sending…" : "Send Decision"}
          </button>
        </div>
      </div>
    </div>
  );
}