import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [briefId, setBriefId] = useState("");
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["full-audit", briefId],
    queryFn: async () => {
      const res = await apiRequest(`/api/site/full-audit/${briefId}`, { method: "POST" });
      return res.json();
    },
    enabled: false,
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Site Audit</h1>
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Enter brief ID..."
            value={briefId}
            onChange={(e) => setBriefId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm flex-1"
          />
          <button onClick={() => refetch()} disabled={!briefId || isFetching} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm disabled:opacity-50">
            {isFetching ? "Auditing..." : "Run Audit"}
          </button>
        </div>

        {data && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Audited at: {new Date(data.auditedAt).toLocaleString()}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(data.audits || {}).map(([key, val]: any) => (
                <div key={key} className="border rounded-lg p-3">
                  <p className="font-medium capitalize">{key}</p>
                  <p className="text-sm text-muted-foreground">{val.status}</p>
                  <p className="text-xs text-muted-foreground">{val.endpoint}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
