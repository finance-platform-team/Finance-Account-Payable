import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Cfm_tmshandoffsService } from "../generated/services/Cfm_tmshandoffsService";
import type { Cfm_tmshandoffsBase } from "../generated/models/Cfm_tmshandoffsModel";
import { useToast } from "../lib/ToastContext";
import { computeDecisionSla } from "../lib/decisionSla";
import { ensureBudgetRequestRecordsExist } from "../lib/treasuryBudgetService";
import AssigneeLookup from "./AssigneeLookup";
import type { BudgetRegion } from "../types/apBudgetRequest";

interface BudgetRequestModalProps {
  open: boolean;
  year: string;
  region: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Priority = "" | "Low" | "Medium" | "High" | "Critical";

// mirrors PRIORITY_MAP in CreateDecisionModal.tsx / cfm_priority choice values
const PRIORITY_MAP: Record<Exclude<Priority, "">, number> = {
  Low: 123200000,
  Medium: 123200001,
  High: 123200002,
  Critical: 931940001,
};

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

export default function BudgetRequestModal({
  open,
  year,
  region,
  onClose,
  onSuccess,
}: BudgetRequestModalProps) {
  const [request, setRequest] = useState("");
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null);
  const [priority, setPriority] = useState<Priority>("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRequest("");
      setAssignee(null);
      setPriority("");
      setDueDate("");
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  const start = todayIso();

  async function handleNotifyTreasury() {
    if (!request.trim()) {
      setErrorMsg("Please describe the budget you are requesting.");
      return;
    }
    if (!assignee) {
      setErrorMsg("Please select a Treasury assignee.");
      return;
    }
    if (!dueDate) {
      setErrorMsg("Please select a due date.");
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
      // Bootstraps the cfm_requestbudget BU x Month records for this
      // Year/Region so the grid populates immediately after the request —
      // mirrors handleSendDecision()'s call to ensureBudgetRequestRecordsExist()
      // before creating the TMS task (CFM_APNew.html:12945-12966).
      await ensureBudgetRequestRecordsExist(year, region as BudgetRegion);

      const sla = computeDecisionSla(start, dueDate);

      const record: Partial<Cfm_tmshandoffsBase> = {
        cfm_tasktitle: `Budget Request — ${region} ${year}`,
        cfm_taskdescription: request.trim(),
        cfm_typeaction: "Budget Request",
        cfm_duedate: `${dueDate}T00:00:00Z`,
        cfm_progress: 123200004,
        cfm_sla: sla,
        cfm_decisionfromwhere: 2 as never, // Request Budget -> 2, matches openDecision()'s mapping
        "cfm_Assignee@odata.bind": `/systemusers(${assignee.id})`,
      };
      if (priority) record.cfm_priority = PRIORITY_MAP[priority] as never;

      await Cfm_tmshandoffsService.create(
        record as unknown as Omit<Cfm_tmshandoffsBase, "cfm_tmshandoffid">,
      );

      showToast(
        "Task Decision Sent",
        `Budget request notified to Treasury · ${region} ${year}.`,
        "success",
      );
      onSuccess();
    } catch (err) {
      console.error("Error creating Budget Request TMS task:", err);
      setErrorMsg("Could not notify Treasury. Please try again.");
      showToast("Error", "Could not notify Treasury.", "alert");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div>
            <div className="modal-title">Request Budget</div>
            <div className="modal-sub">Budget Request → Treasury (TMS)</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div
            style={{
              font: "400 12.5px var(--body)",
              color: "var(--muted)",
              lineHeight: 1.55,
              marginBottom: 14,
            }}
          >
            Submitting notifies Treasury on TMS immediately to insert the Adj.
            SC Budget.
          </div>

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
            <label className="field-lbl">
              Request <span className="field-req">*</span>
            </label>
            <textarea
              className="field-input"
              rows={3}
              style={{ resize: "vertical" }}
              placeholder="Describe the budget you are requesting..."
              value={request}
              onChange={(e) => setRequest(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-lbl">
              Assignee <span className="field-req">*</span>
            </label>
            <AssigneeLookup value={assignee} onChange={setAssignee} />
          </div>

          <div className="form-field">
            <label className="field-lbl">Priority</label>
            <div className="select-wrap" style={{ display: "block" }}>
              <select
                className="field-input"
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

          <div className="form-field">
            <label className="field-lbl">
              Due Date <span className="field-req">*</span>
            </label>
            <input
              className="field-input"
              type="date"
              min={start}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleNotifyTreasury}
            disabled={submitting}
            style={{ background: "var(--gold-dark)", borderColor: "var(--gold-dark)" }}
          >
            {submitting ? "Sending…" : "Notify Treasury"}
          </button>
        </div>
      </div>
    </div>
  );
}
