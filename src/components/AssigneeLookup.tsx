import { useEffect, useRef, useState } from "react";
import { SystemusersService } from "../generated/services/SystemusersService";

interface AssigneeOption {
  id: string;
  name: string;
}

interface AssigneeLookupProps {
  value: AssigneeOption | null;
  onChange: (value: AssigneeOption | null) => void;
}

export default function AssigneeLookup({ value, onChange }: AssigneeLookupProps) {
  const [query, setQuery] = useState(value?.name || "");
  const [options, setOptions] = useState<AssigneeOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleInputChange(text: string) {
    setQuery(text);
    onChange(null);
    setOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setOptions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await SystemusersService.getAll({
          select: ["systemuserid", "fullname"],
          filter: `contains(fullname,'${text.replace(/'/g, "''")}') and isdisabled eq false`,
          top: 8,
        });
   const rows = (res.data || []) as unknown as {
          systemuserid: string;
          fullname?: string;
        }[];
        setOptions(
          rows
            .filter((r) => !!r.fullname)
            .map((r) => ({ id: r.systemuserid, name: r.fullname as string }))
        );
      } catch (err) {
        console.error("فشل البحث عن الموظفين:", err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(opt: AssigneeOption) {
    onChange(opt);
    setQuery(opt.name);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="field-input"
        type="text"
placeholder="Search for a user..."        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            zIndex: 50,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--dim)" }}>
              جاري البحث…
            </div>
          )}
          {!loading && options.length === 0 && query.trim().length >= 2 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--dim)" }}>
              لا يوجد نتائج
            </div>
          )}
          {!loading &&
            options.map((opt) => (
              <div
                key={opt.id}
                onClick={() => handleSelect(opt)}
                style={{
                  padding: "9px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {opt.name}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}