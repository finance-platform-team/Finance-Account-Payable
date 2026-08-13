// src/components/SlaConfig.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteSlaRule,
  fetchSlaRules,
  saveSlaRule,
  searchSlaUsers,
  toggleSlaRuleStatus,
} from "../lib/slaService";
import type { SlaRule } from "../types/sla";
import { SLA_TYPE_DATE, SLA_TYPE_HOURS } from "../types/sla";
import type { SlaTypeValue } from "../types/sla";
import { useToast } from "../lib/ToastContext";
import SlaTracking from "./SlaTracking";
import { Search } from "lucide-react";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface UserLookupFieldProps {
  label: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string, name: string) => void;
}

/** Debounced user search-as-you-type — mirrors the sla-config-* lookup fields. */
function UserLookupField({ label, search, onSearchChange, onSelect }: UserLookupFieldProps) {
  const [results, setResults] = useState<{ id: string; fullname: string }[]>([]);
  const [visible, setVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(value: string) {
    onSearchChange(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = value.trim();
    if (term.length < 2) {
      setResults([]);
      setVisible(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchSlaUsers(term);
        setResults(r);
        setVisible(true);
      } catch (e) {
        console.warn("SLA user lookup error:", e);
        setResults([]);
        setVisible(true);
      }
    }, 300);
  }

  return (
    <div className="form-field" style={{ position: "relative" }}>
      <label className="field-lbl">{label}</label>
      <input
        className="field-input"
        type="text"
        autoComplete="off"
        placeholder="Search user..."
        value={search}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setVisible(true)}
      />
      <div className={`user-lookup-results${visible ? " visible" : ""}`}>
        {results.length === 0 ? (
          <div style={{ padding: "8px 12px", color: "var(--dim)" }}>No users found</div>
        ) : (
          results.map((u) => (
            <div
              key={u.id}
              className="user-lookup-item"
              onClick={() => {
                onSelect(u.id, u.fullname);
                setVisible(false);
              }}
            >
              <span className="lookup-avatar">{getInitials(u.fullname)}</span>
              <span>{u.fullname}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  action: "",
  slaType: SLA_TYPE_HOURS as SlaTypeValue,
  value: "",
  escalationRule: "",
  deduction: "",
  department1: "",
  department2: "",
  responsibleId: "",
  responsibleSearch: "",
  manager1Id: "",
  manager1Search: "",
  manager2Id: "",
  manager2Search: "",
};

export default function SlaConfig() {
  const { showToast } = useToast();

  const [list, setList] = useState<SlaRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SlaRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSlaRules();
      setList(data);
    } catch (e) {
      console.error("Failed to load cfm_sla records:", e);
      showToast("Error", "Failed to load SLA rules.", "alert");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount.
    loadList();
  }, [loadList]);

  const filteredList = list.filter((r) => {
    if (typeFilter !== "all" && String(r.slaType) !== typeFilter) return false;
    const q = search.toLowerCase().trim();
    if (q) {
      const combined = `${r.action} ${r.escalationRule} ${r.responsibleName} ${r.department1} ${r.manager1Name} ${r.department2} ${r.manager2Name}`.toLowerCase();
      if (!combined.includes(q)) return false;
    }
    return true;
  });

  function openAddModal() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(rec: SlaRule) {
    setEditId(rec.id);
    setForm({
      action: rec.action === "-" ? "" : rec.action,
      slaType: rec.slaType,
      value: rec.value === "-" ? "" : rec.value,
      escalationRule: rec.escalationRule === "-" ? "" : rec.escalationRule,
      deduction: rec.deduction || "",
      department1: rec.department1 === "-" ? "" : rec.department1,
      department2: rec.department2 === "-" ? "" : rec.department2,
      responsibleId: rec.responsibleId,
      responsibleSearch: rec.responsibleId ? rec.responsibleName : "",
      manager1Id: rec.manager1Id,
      manager1Search: rec.manager1Id ? rec.manager1Name : "",
      manager2Id: rec.manager2Id,
      manager2Search: rec.manager2Id ? rec.manager2Name : "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function handleSave() {
    if (!form.action.trim()) {
      showToast("Required", "Please enter the Action name.", "alert");
      return;
    }
    if (!form.value.trim()) {
      showToast("Required", "Please enter the SLA hours or date.", "alert");
      return;
    }
    if (!form.escalationRule.trim()) {
      showToast("Required", "Please enter the Escalation Rule.", "alert");
      return;
    }

    setSaving(true);
    try {
      await saveSlaRule(editId, {
        action: form.action.trim(),
        slaType: form.slaType,
        value: form.value.trim(),
        escalationRule: form.escalationRule.trim(),
        deduction: form.deduction.trim(),
        department1: form.department1.trim(),
        department2: form.department2.trim(),
        responsibleId: form.responsibleId,
        manager1Id: form.manager1Id,
        manager2Id: form.manager2Id,
      });
      setModalOpen(false);
      await loadList();
      showToast("Saved", editId ? "SLA rule updated." : "SLA rule created.", "success");
    } catch (e) {
      console.error("Failed to save cfm_sla record:", e);
      showToast("Error", "Failed to save the SLA rule. Please try again.", "alert");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(rec: SlaRule) {
    try {
      await toggleSlaRuleStatus(rec.id, !rec.active);
      await loadList();
      showToast("Updated", !rec.active ? "SLA rule activated." : "SLA rule deactivated.", "success");
    } catch (e) {
      console.error("Failed to toggle cfm_sla status:", e);
      showToast("Error", "Failed to update the SLA rule status.", "alert");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSlaRule(deleteTarget.id);
      setDeleteTarget(null);
      await loadList();
      showToast("Deleted", "SLA rule deleted.", "success");
    } catch (e) {
      console.error("Failed to delete cfm_sla record:", e);
      showToast("Error", "Failed to delete the SLA rule.", "alert");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
        <div>
          <div style={{ font: "700 15px var(--sans)", color: "var(--brand-black)" }}>SLA & Escalation</div>
          <div style={{ font: "400 12px var(--body)", color: "var(--muted)", marginTop: 2 }}>
            Manage SLA rules, deadlines, and escalation routing per action.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" onClick={loadList}>
            Refresh
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            + Add SLA Rule
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="search-box" style={{ maxWidth: 260, marginLeft: 0 }}>
          <Search size={13} style={{ color: "var(--dim)" }} />
          <input
            type="text"
            placeholder="Search action, department, manager…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="select-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value={SLA_TYPE_HOURS}>Hours</option>
            <option value={SLA_TYPE_DATE}>Date</option>
          </select>
          <span className="sel-arrow">▾</span>
        </div>
      </div>

      <div className="pp-panel" style={{ overflow: "auto", marginBottom: 28 }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>SLA Type</th>
              <th>Hours / Date</th>
              <th>Escalation Rule</th>
              <th>Responsible</th>
              <th>Department 1</th>
              <th>Manager (Dept 1)</th>
              <th>Department 2</th>
              <th>Manager (Dept 2)</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No SLA rules configured yet. Click "Add SLA Rule" to create one.
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No SLA rules match the current filters.
                </td>
              </tr>
            ) : (
              filteredList.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.action}</td>
                  <td>{r.slaTypeLabel}</td>
                  <td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{r.value}</td>
                  <td>{r.escalationRule}</td>
                  <td>{r.responsibleName}</td>
                  <td>{r.department1}</td>
                  <td>{r.manager1Name}</td>
                  <td>{r.department2}</td>
                  <td>{r.manager2Name}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "5px 10px", fontSize: 11, marginRight: 6 }}
                      onClick={() => handleToggleStatus(r)}
                    >
                      {r.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "5px 10px", fontSize: 11, marginRight: 6 }}
                      onClick={() => openEditModal(r)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "5px 10px", fontSize: 11, color: "var(--danger)", borderColor: "rgba(178,58,58,0.25)" }}
                      onClick={() => setDeleteTarget(r)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SlaTracking />

      {/* ── Add/Edit modal ── */}
      {modalOpen && (
        <div className="modal-overlay active" onClick={closeModal}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">{editId ? "Edit SLA Rule" : "Add SLA Rule"}</div>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label className="field-lbl">
                  Action <span className="field-req">*</span>
                </label>
                <input
                  className="field-input"
                  type="text"
                  value={form.action}
                  onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                />
              </div>

              <div className="form-2col">
                <div className="form-field">
                  <label className="field-lbl">SLA Type</label>
                  <div className="select-wrap" style={{ display: "block" }}>
                    <select
                      className="field-input"
                      style={{ paddingRight: 32 }}
                      value={form.slaType}
                      onChange={(e) => {
                        const slaType = Number(e.target.value) as SlaTypeValue;
                        setForm((f) => ({
                          ...f,
                          slaType,
                          value: slaType === SLA_TYPE_DATE && !/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? "" : f.value,
                        }));
                      }}
                    >
                      <option value={SLA_TYPE_HOURS}>Hours</option>
                      <option value={SLA_TYPE_DATE}>Date</option>
                    </select>
                    <span className="sel-arrow">▾</span>
                  </div>
                </div>
                <div className="form-field">
                  <label className="field-lbl">
                    SLA ({form.slaType === SLA_TYPE_DATE ? "Date" : "No. of Hours"}) <span className="field-req">*</span>
                  </label>
                  <input
                    className="field-input"
                    type={form.slaType === SLA_TYPE_DATE ? "date" : "text"}
                    placeholder={form.slaType === SLA_TYPE_DATE ? undefined : "e.g. 24"}
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-field">
                <label className="field-lbl">
                  Escalation Rule <span className="field-req">*</span>
                </label>
                <input
                  className="field-input"
                  type="text"
                  value={form.escalationRule}
                  onChange={(e) => setForm((f) => ({ ...f, escalationRule: e.target.value }))}
                />
              </div>

              <div className="form-field">
                <label className="field-lbl">Deduction</label>
                <input
                  className="field-input"
                  type="text"
                  value={form.deduction}
                  onChange={(e) => setForm((f) => ({ ...f, deduction: e.target.value }))}
                />
              </div>

              <UserLookupField
                label="Responsible"
                search={form.responsibleSearch}
                onSearchChange={(v) => setForm((f) => ({ ...f, responsibleSearch: v, responsibleId: "" }))}
                onSelect={(id, name) => setForm((f) => ({ ...f, responsibleId: id, responsibleSearch: name }))}
              />

              <div className="form-2col">
                <div className="form-field">
                  <label className="field-lbl">Department 1</label>
                  <input
                    className="field-input"
                    type="text"
                    value={form.department1}
                    onChange={(e) => setForm((f) => ({ ...f, department1: e.target.value }))}
                  />
                </div>
                <UserLookupField
                  label="Manager (Dept 1)"
                  search={form.manager1Search}
                  onSearchChange={(v) => setForm((f) => ({ ...f, manager1Search: v, manager1Id: "" }))}
                  onSelect={(id, name) => setForm((f) => ({ ...f, manager1Id: id, manager1Search: name }))}
                />
              </div>

              <div className="form-2col">
                <div className="form-field">
                  <label className="field-lbl">Department 2</label>
                  <input
                    className="field-input"
                    type="text"
                    value={form.department2}
                    onChange={(e) => setForm((f) => ({ ...f, department2: e.target.value }))}
                  />
                </div>
                <UserLookupField
                  label="Manager (Dept 2)"
                  search={form.manager2Search}
                  onSearchChange={(v) => setForm((f) => ({ ...f, manager2Search: v, manager2Id: "" }))}
                  onSelect={(id, name) => setForm((f) => ({ ...f, manager2Id: id, manager2Search: name }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <div className="modal-overlay active" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Delete SLA Rule</div>
              <button className="modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ font: "500 12.5px var(--body)", color: "var(--text-body)" }}>
                Delete this SLA rule? This cannot be undone.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
