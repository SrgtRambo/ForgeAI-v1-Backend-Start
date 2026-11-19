import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const [briefId, setBriefId] = useState("");
  const { data: dashboard } = useQuery({
    queryKey: ["site-dashboard", briefId],
    queryFn: async () => {
      const res = await apiRequest(`/api/site/dashboard/${briefId}`);
      return res.json();
    },
    enabled: !!briefId,
  });

  const { data: health } = useQuery({
    queryKey: ["health-score", briefId],
    queryFn: async () => {
      const res = await apiRequest(`/api/site/health-score/${briefId}`);
      return res.json();
    },
    enabled: !!briefId,
  });

  const { data: metrics } = useQuery({
    queryKey: ["site-metrics", briefId],
    queryFn: async () => {
      const res = await apiRequest(`/api/site/metrics/${briefId}`);
      return res.json();
    },
    enabled: !!briefId,
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Site Dashboard</h1>
        <div className="mb-6">
          <input
            type="text"
            placeholder="Enter brief ID..."
            value={briefId}
            onChange={(e) => setBriefId(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm w-full"
          />
        </div>

        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{dashboard.pageCount}</div>
              <div className="text-sm text-muted-foreground">Pages</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{dashboard.sectionCount}</div>
              <div className="text-sm text-muted-foreground">Sections</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{dashboard.imageCount}</div>
              <div className="text-sm text-muted-foreground">Images</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold">{health?.score || "—"}</div>
              <div className="text-sm text-muted-foreground">Health Score</div>
            </div>
          </div>
        )}

        {dashboard && (
          <div className="border rounded-lg p-4 mb-6">
            <h2 className="font-semibold mb-2">{dashboard.businessName}</h2>
            <p className="text-sm text-muted-foreground">{dashboard.tagline}</p>
            <p className="text-sm text-muted-foreground mt-2">Status: {dashboard.generationStatus} · QA: {dashboard.qaStatus || "pending"}</p>
            {dashboard.publishedUrl && <p className="text-sm text-green-600 mt-1">Published: {dashboard.publishedUrl}</p>}
            {dashboard.tags?.length > 0 && (
              <div className="flex gap-2 mt-2">{dashboard.tags.map((t: string) => <span key={t} className="text-xs bg-muted px-2 py-1 rounded">{t}</span>)}</div>
            )}
          </div>
        )}

        {metrics && (
          <div className="border rounded-lg p-4">
            <h2 className="font-semibold mb-2">Site Metrics</h2>
            <p className="text-sm">Has forms: {metrics.metrics?.hasForms ? "Yes" : "No"}</p>
            <p className="text-sm">Has pricing: {metrics.metrics?.hasPricing ? "Yes" : "No"}</p>
            <p className="text-sm">Has testimonials: {metrics.metrics?.hasTestimonials ? "Yes" : "No"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
