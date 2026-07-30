import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Cfm_tmshandoffsService } from "../generated/services/Cfm_tmshandoffsService";
import type { Cfm_tmshandoffsBase } from "../generated/models/Cfm_tmshandoffsModel";
import { useToast } from "../lib/ToastContext";

interface BudgetRequestModalProps {
  open: boolean;
  year: string;
  region: string;
  onClose: () => void;
  onSuccess: () => void;
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

export default function BudgetRequestModal({
  open,
  year,
  region,
  onClose,
  onSuccess,
}: BudgetRequestModalProps) {
  const [request, setRequest] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (open) {
      setRequest("");
      setOwner("");
      setDueDate("");
      setErrorMsg(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleNotifyTreasury() {
    if (!request.trim()) {
      setErrorMsg("Please describe the budget you are requesting.");
      return;
    }
    if (!owner.trim()) {
      setErrorMsg("Please mention a Treasury owner.");
      return;
    }
    if (!dueDate) {
      setErrorMsg("Please select a due date.");
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const record: Partial<Cfm_tmshandoffsBase> = {
        cfm_tasktitle: `Budget Request — ${region} ${year}`,
        cfm_taskdescription: `Owner: ${owner.trim()}\n\n${request.trim()}`,
        cfm_typeaction: "Budget Request",
        cfm_duedate: `${dueDate}T00:00:00Z`,
        cfm_progress: 123200004,
        cfm_decisionfromwhere: 2 as never, // Request Budget -> 2, matches openDecision()'s mapping
      };

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
              Mention Owner <span className="field-req">*</span>
            </label>
            <input
              className="field-input"
              type="text"
              placeholder="@treasury.owner..."
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="field-lbl">
              Due Date <span className="field-req">*</span>
            </label>
            <input
              className="field-input"
              type="date"
              min={todayIso()}
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