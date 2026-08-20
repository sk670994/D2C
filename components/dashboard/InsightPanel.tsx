"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ActionItem, OpportunityScan, MoneyAlert } from "@/lib/llm/decision-engine";

interface ActionPanelProps {
  decisions: OpportunityScan;
  isLoading?: boolean;
}

export function ActionPanel({ decisions, isLoading }: ActionPanelProps) {
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "excellent":
        return "bg-green-50 border-green-200";
      case "healthy":
        return "bg-blue-50 border-blue-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "critical":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case "excellent":
        return <Badge className="bg-green-600">Excellent ✓</Badge>;
      case "healthy":
        return <Badge className="bg-blue-600">Healthy →</Badge>;
      case "warning":
        return <Badge className="bg-yellow-600">Warning ⚠</Badge>;
      case "critical":
        return <Badge className="bg-red-600">Critical 🚨</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Opportunity Score Card */}
      <Card className={`border-2 ${getTrendColor(decisions.trend)}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Business Health Score</CardTitle>
              <CardDescription>Overall performance across all metrics</CardDescription>
            </div>
            {getTrendBadge(decisions.trend)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Big score display */}
            <div className="text-center">
              <div className="text-5xl font-bold">{decisions.score}</div>
              <div className="text-sm text-gray-600">out of 100</div>
            </div>

            {/* Score breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-xs text-gray-600">ROAS</div>
                <div className="text-lg font-semibold">{decisions.breakdown.roas.score}</div>
                <div className="text-xs text-gray-500">{decisions.breakdown.roas.status}</div>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-xs text-gray-600">CAC</div>
                <div className="text-lg font-semibold">{decisions.breakdown.cac.score}</div>
                <div className="text-xs text-gray-500">{decisions.breakdown.cac.status}</div>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-xs text-gray-600">Margin</div>
                <div className="text-lg font-semibold">{decisions.breakdown.margin.score}</div>
                <div className="text-xs text-gray-500">{decisions.breakdown.margin.status}</div>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-xs text-gray-600">Spend</div>
                <div className="text-lg font-semibold">{decisions.breakdown.spend.score}</div>
                <div className="text-xs text-gray-500">{decisions.breakdown.spend.status}</div>
              </div>
              <div className="text-center p-2 bg-white rounded border">
                <div className="text-xs text-gray-600">Volume</div>
                <div className="text-lg font-semibold">{decisions.breakdown.volume.score}</div>
                <div className="text-xs text-gray-500">{decisions.breakdown.volume.status}</div>
              </div>
            </div>

            {/* Opportunity rank */}
            <div className="border-t pt-3">
              <div className="text-2xl font-bold">{decisions.opportunityRank.label}</div>
              <div className="text-sm text-gray-700">
                Next milestone: <span className="font-semibold">{decisions.opportunityRank.nextMilestone}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Actions */}
      {decisions.todayActions.length > 0 && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">🔥 DO THIS TODAY</CardTitle>
            <CardDescription>Critical actions for immediate impact</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {decisions.todayActions.map((action, idx) => (
                <ActionItemCard key={idx} action={action} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* This Week Actions */}
      {decisions.thisWeekActions.length > 0 && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">📈 DO THIS WEEK</CardTitle>
            <CardDescription>Medium-term growth actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {decisions.thisWeekActions.map((action, idx) => (
                <ActionItemCard key={idx} action={action} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionItemCard({ action }: { action: ActionItem }) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "bg-red-100 border-red-300";
      case "high":
        return "bg-orange-100 border-orange-300";
      case "medium":
        return "bg-yellow-100 border-yellow-300";
      case "low":
        return "bg-gray-100 border-gray-300";
      default:
        return "bg-gray-100 border-gray-300";
    }
  };

  return (
    <div className={`p-3 rounded border-l-4 ${getPriorityColor(action.priority)} bg-white`}>
      <div className="font-semibold">{action.title}</div>
      <div className="text-sm text-gray-700 mt-1">{action.description}</div>
      <div className="text-xs text-gray-600 mt-2">
        <strong>Impact:</strong> {action.expectedImpact}
      </div>
      {action.estimatedWeeklyRevenue && (
        <div className="text-xs text-green-700 font-semibold mt-1">
          💰 Potential: ₹{Math.round(action.estimatedWeeklyRevenue)} weekly
        </div>
      )}
      {action.estimatedWeeklyLoss && (
        <div className="text-xs text-red-700 font-semibold mt-1">
          🚨 Loss: ₹{Math.round(action.estimatedWeeklyLoss)} weekly if no action
        </div>
      )}
    </div>
  );
}

interface AlertPanelProps {
  alerts: MoneyAlert[];
  isLoading?: boolean;
}

export function AlertPanel({ alerts, isLoading }: AlertPanelProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-50 border-l-4 border-red-500";
      case "warning":
        return "bg-yellow-50 border-l-4 border-yellow-500";
      case "info":
        return "bg-blue-50 border-l-4 border-blue-500";
      case "success":
        return "bg-green-50 border-l-4 border-green-500";
      default:
        return "bg-gray-50 border-l-4 border-gray-300";
    }
  };

  if (alerts.length === 0) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle>✅ All Clear</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">No critical alerts. Keep monitoring your metrics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>💡 Money Alerts</CardTitle>
        <CardDescription>Critical metrics and opportunities</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert, idx) => (
            <div key={idx} className={`p-3 rounded ${getSeverityColor(alert.severity)}`}>
              <div className="font-semibold">{alert.headline}</div>
              <div className="text-sm text-gray-700 mt-1">{alert.message}</div>
              <div className="text-xs text-gray-600 mt-2 grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold">Current:</span> {alert.currentValue}
                </div>
                <div>
                  <span className="font-semibold">Threshold:</span> {alert.threshold}
                </div>
              </div>
              {alert.action && (
                <div className="text-xs font-semibold text-blue-700 mt-2">✓ {alert.action}</div>
              )}
              {alert.weeklyImpact && (
                <div className={`text-xs font-semibold mt-2 ${alert.weeklyImpact > 0 ? "text-green-700" : "text-red-700"}`}>
                  Weekly impact: ₹{Math.round(Math.abs(alert.weeklyImpact))}
                  {alert.weeklyImpact > 0 ? " 📈" : " 📉"}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
