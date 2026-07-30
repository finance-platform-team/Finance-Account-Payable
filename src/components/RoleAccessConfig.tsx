// src/components/RoleAccessConfig.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteRoleAccess,
  fetchRoleAccessList,
  saveRoleAccess,
  searchUsersByName,
} from "../lib/roleAccessService";
import type { RoleAccessRecord, UserSearchResult } from "../types/roleAccess";
import { ROLE_OPTIONS } from "../types/roleAccess";
import { useToast } from "../lib/ToastContext";

/** Initials helper — mirrors getInitials() used for the lookup avatar. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RoleAccessConfig() {
  const { showToast } = useToast();

  const [list, setList] = useState<RoleAccessRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Add/Edit modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState("");
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delete confirm ──
  const [deleteTarget, setDeleteTarget] = useState<RoleAccessRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRoleAccessList();
      setList(data);
    } catch (e) {
      console.error("Failed to load cfm_rolesecurity records:", e);
      showToast("Error", "Failed to load Role Access records.", "alert");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount.
    loadList();
  }, [loadList]);

  function openAddModal() {
    setEditId(null);
    setUserSearch("");
    setSelectedUserId("");
    setRole("");
    setUserResults([]);
    setResultsVisible(false);
    setModalOpen(true);
  }

  function openEditModal(rec: RoleAccessRecord) {
    setEditId(rec.id);
    setUserSearch(rec.userName === "-" ? "" : rec.userName);
    setSelectedUserId(rec.userId);
    setRole(rec.role === "-" ? "" : rec.role);
    setUserResults([]);
    setResultsVisible(false);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  // ── User search — mirrors onRoleAccessUserInput() (300ms debounce) ──
  function handleUserSearchChange(value: string) {
    setUserSearch(value);
    setSelectedUserId("");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = value.trim();
    if (term.length < 2) {
      setUserResults([]);
      setResultsVisible(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsersByName(term);
        setUserResults(results);
        setResultsVisible(true);
      } catch (e) {
        console.warn("Role Access user lookup error:", e);
        setUserResults([]);
        setResultsVisible(true);
      }
    }, 300);
  }

  function selectUser(u: UserSearchResult) {
    setSelectedUserId(u.id);
    setUserSearch(u.fullname);
    setResultsVisible(false);
  }

  async function handleSave() {
    if (!selectedUserId) {
      showToast("Required", "Please search and select a user.", "alert");
      return;
    }
    if (!role) {
      showToast("Required", "Please select a Role.", "alert");
      return;
    }

    setSaving(true);
    try {
      const existing = editId ? list.find((x) => x.id === editId) : undefined;
      await saveRoleAccess(editId, selectedUserId, role, existing?.userId);
      setModalOpen(false);
      await loadList();
      showToast("Saved", editId ? "User role updated." : "User role assigned.", "success");
    } catch (e) {
      console.error("Failed to save cfm_rolesecurity record:", e);
      showToast("Error", "Failed to save the user role. Please try again.", "alert");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(rec: RoleAccessRecord) {
    setDeleteTarget(rec);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRoleAccess(deleteTarget.id);
      setDeleteTarget(null);
      await loadList();
      showToast("Removed", "User role assignment removed.", "success");
    } catch (e) {
      console.error("Failed to delete cfm_rolesecurity record:", e);
      showToast("Error", "Failed to remove the role assignment.", "alert");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ font: "700 15px var(--sans)", color: "var(--brand-black)" }}>Role Access</div>
          <div style={{ font: "400 12px var(--body)", color: "var(--muted)", marginTop: 2 }}>
            Assign which role each user has — controls which pages they see.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          + Add User Role
        </button>
      </div>

      <div className="pp-panel" style={{ overflow: "hidden" }}>
        <table className="config-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  Loading...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No user roles configured yet. Click "Add User Role" to assign one.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.userName}</td>
                  <td>
                    <span className="pp-badge" style={{ background: "var(--gold-soft)", color: "var(--gold-dark)" }}>
                      {r.role}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "5px 10px", fontSize: 11, marginRight: 8 }}
                      onClick={() => openEditModal(r)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "5px 10px", fontSize: 11, color: "var(--danger)", borderColor: "rgba(178,58,58,0.25)" }}
                      onClick={() => confirmDelete(r)}
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

      {/* ── Add/Edit modal ── */}
      {modalOpen && (
        <div className="modal-overlay active" onClick={closeModal}>
          <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div>
                <div className="modal-title">{editId ? "Edit User Role" : "Add User Role"}</div>
                <div className="modal-sub">Choose the user and the role that controls which pages they see.</div>
              </div>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-field" style={{ position: "relative" }}>
                <label className="field-lbl">User</label>
                <input
                  className="field-input"
                  type="text"
                  autoComplete="off"
                  placeholder="Search user..."
                  value={userSearch}
                  onChange={(e) => handleUserSearchChange(e.target.value)}
                  onFocus={() => userResults.length > 0 && setResultsVisible(true)}
                />
                <div className={`user-lookup-results${resultsVisible ? " visible" : ""}`}>
                  {userResults.length === 0 ? (
                    <div style={{ padding: "8px 12px", color: "var(--dim)" }}>No users found</div>
                  ) : (
                    userResults.map((u) => (
                      <div key={u.id} className="user-lookup-item" onClick={() => selectUser(u)}>
                        <span className="lookup-avatar">{getInitials(u.fullname)}</span>
                        <span>{u.fullname}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="form-field" style={{ marginBottom: 0 }}>
                <label className="field-lbl">Role</label>
                <div className="select-wrap" style={{ display: "block" }}>
                  <select className="field-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ paddingRight: 32 }}>
                    <option value="">Select role...</option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <span className="sel-arrow">▾</span>
                </div>
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
              <div className="modal-title">Remove Role</div>
              <button className="modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ font: "500 12.5px var(--body)", color: "var(--text-body)" }}>
                Remove this user's role assignment?
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
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}