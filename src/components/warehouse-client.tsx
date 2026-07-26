"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, Input, Label, ListPanel, ListRow } from "@/components/ui";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  is_active: boolean;
};
type Rack = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string | null;
  is_active: boolean;
};
type Bin = {
  id: string;
  rack_id: string;
  code: string;
  name: string | null;
  is_active: boolean;
};

export function WarehouseClient({ canManage }: { canManage: boolean }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [selectedWh, setSelectedWh] = useState("");
  const [selectedRack, setSelectedRack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/warehouse");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Load failed");
      return;
    }
    setWarehouses(json.warehouses ?? []);
    setRacks(json.racks ?? []);
    setBins(json.bins ?? []);
    if (!selectedWh && json.warehouses?.[0]?.id) {
      setSelectedWh(json.warehouses[0].id);
    }
  }, [selectedWh]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/warehouse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Failed");
      return;
    }
    setMessage("Saved");
    await load();
  }

  const whRacks = racks.filter((r) => r.warehouse_id === selectedWh);
  const rackBins = bins.filter((b) => b.rack_id === selectedRack);

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <h2 className="text-sm font-medium">Warehouses</h2>
        <ListPanel>
          {warehouses.map((w) => (
            <ListRow
              key={w.id}
              primary={`${w.code} — ${w.name}`}
              meta={!w.is_active ? "Inactive" : w.address || undefined}
              highlight={selectedWh === w.id}
              onClick={() => {
                setSelectedWh(w.id);
                setSelectedRack("");
              }}
              trailing={
                canManage ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-[var(--brand)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      void post({
                        action: "toggle",
                        toggle: {
                          table: "warehouses",
                          id: w.id,
                          is_active: !w.is_active,
                        },
                      });
                    }}
                  >
                    {w.is_active ? "Disable" : "Enable"}
                  </button>
                ) : null
              }
            />
          ))}
        </ListPanel>
        {canManage ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              Code auto-generated (WH000001…).
            </div>
            <div>
              <Label>Name</Label>
              <Input value={whName} onChange={(e) => setWhName(e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={whAddress} onChange={(e) => setWhAddress(e.target.value)} />
            </div>
            <Button
              disabled={busy || !whName.trim()}
              onClick={() =>
                void post({
                  action: "create_warehouse",
                  warehouse: { name: whName, address: whAddress },
                })
              }
            >
              Add warehouse
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-medium">Racks</h2>
        {whRacks.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No racks in this warehouse.</p>
        ) : (
          <ListPanel>
            {whRacks.map((r) => (
              <ListRow
                key={r.id}
                primary={r.code}
                meta={r.name || undefined}
                highlight={selectedRack === r.id}
                onClick={() => setSelectedRack(r.id)}
              />
            ))}
          </ListPanel>
        )}
        {canManage && selectedWh ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--ink-muted)]">Rack code auto-generated (RK000001…).</p>
            <Button
              disabled={busy}
              onClick={() =>
                void post({
                  action: "create_rack",
                  rack: { warehouse_id: selectedWh },
                })
              }
            >
              Add rack
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-medium">Bins</h2>
        {!selectedRack ? (
          <p className="text-sm text-[var(--ink-muted)]">Select a rack first.</p>
        ) : rackBins.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">No bins on this rack.</p>
        ) : (
          <ListPanel>
            {rackBins.map((b) => (
              <ListRow
                key={b.id}
                primary={b.code}
                meta={b.name || undefined}
              />
            ))}
          </ListPanel>
        )}
        {canManage && selectedRack ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--ink-muted)]">Bin code auto-generated (BN000001…).</p>
            <Button
              disabled={busy}
              onClick={() =>
                void post({
                  action: "create_bin",
                  bin: { rack_id: selectedRack },
                })
              }
            >
              Add bin
            </Button>
          </div>
        ) : null}
      </Card>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--brand)]">{message}</p> : null}
    </div>
  );
}
