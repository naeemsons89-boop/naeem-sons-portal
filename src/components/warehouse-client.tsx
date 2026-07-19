"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Card, Input, Label } from "@/components/ui";

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

  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [rackCode, setRackCode] = useState("");
  const [binCode, setBinCode] = useState("");

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
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-semibold">Warehouses</h2>
        <div className="space-y-2">
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setSelectedWh(w.id);
                setSelectedRack("");
              }}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                selectedWh === w.id
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)]"
              }`}
            >
              <span>
                <strong>{w.code}</strong> — {w.name}
                {!w.is_active ? " (inactive)" : ""}
              </span>
              {canManage ? (
                <span
                  className="text-xs font-semibold text-[var(--brand)]"
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
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canManage ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label>Code</Label>
              <Input value={whCode} onChange={(e) => setWhCode(e.target.value)} placeholder="WH2" />
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
              disabled={busy}
              onClick={() =>
                void post({
                  action: "create_warehouse",
                  warehouse: { code: whCode, name: whName, address: whAddress },
                })
              }
            >
              Add warehouse
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Racks</h2>
        <div className="space-y-2">
          {whRacks.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRack(r.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                selectedRack === r.id
                  ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                  : "border-[var(--line)]"
              }`}
            >
              <span>
                <strong>{r.code}</strong> {r.name ? `— ${r.name}` : ""}
              </span>
            </button>
          ))}
          {whRacks.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No racks in this warehouse.</p>
          ) : null}
        </div>
        {canManage && selectedWh ? (
          <div className="flex gap-2">
            <Input
              value={rackCode}
              onChange={(e) => setRackCode(e.target.value)}
              placeholder="Rack code e.g. R01"
            />
            <Button
              disabled={busy}
              onClick={() =>
                void post({
                  action: "create_rack",
                  rack: { warehouse_id: selectedWh, code: rackCode },
                })
              }
            >
              Add rack
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Bins</h2>
        <ul className="space-y-1 text-sm">
          {rackBins.map((b) => (
            <li key={b.id}>
              <strong>{b.code}</strong> {b.name ? `— ${b.name}` : ""}
            </li>
          ))}
          {!selectedRack ? (
            <li className="text-[var(--ink-muted)]">Select a rack first.</li>
          ) : rackBins.length === 0 ? (
            <li className="text-[var(--ink-muted)]">No bins on this rack.</li>
          ) : null}
        </ul>
        {canManage && selectedRack ? (
          <div className="flex gap-2">
            <Input
              value={binCode}
              onChange={(e) => setBinCode(e.target.value)}
              placeholder="Bin code e.g. B01"
            />
            <Button
              disabled={busy}
              onClick={() =>
                void post({
                  action: "create_bin",
                  bin: { rack_id: selectedRack, code: binCode },
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
