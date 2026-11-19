import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const res = await apiRequest("/api/onboarding/steps");
      return res.json();
    },
  });

  const steps = data?.steps || [];
  const progress = data?.progress || 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Welcome to Forge AI</h1>
        <p className="text-muted-foreground mb-6">Let's get you started. Complete these steps to unlock the full platform.</p>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">{progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step: any) => (
            <div key={step.id} className={`flex items-center gap-3 p-4 border rounded-lg ${step.done ? "bg-green-50 border-green-200" : "bg-background"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${step.done ? "bg-green-500 text-white" : "border-2 border-muted-foreground"}`}>
                {step.done ? "✓" : ""}
              </div>
              <div className="flex-1">
                <p className={`font-medium ${step.done ? "line-through text-muted-foreground" : ""}`}>{step.title}</p>
              </div>
              {!step.done && step.action && (
                <button onClick={() => navigate({ to: step.action })} className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded">
                  Start
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
