/**
 * Script approve/reject (decision) capabilities — aligned with backend policy.
 * Use this to show/hide decision buttons so UI matches backend 403 rules.
 *
 * Policy:
 * - Regulator: can decide only scripts assigned to them; cannot decide own script.
 * - Admin: can decide any script except own (conflict of interest).
 * - Super Admin: can decide any script including own (override).
 */

export interface ScriptForDecision {
  created_by?: string | null;
  assigneeId?: string | null;
}

export interface UserForDecision {
  id: string;
  role: string;
}

export interface ScriptDecisionCapabilities {
  canApprove: boolean;
  canReject: boolean;
  /** Shown when both canApprove and canReject are false; null if bar can be shown with at least one button. */
  reasonIfDisabled: string | null;
}

export function getScriptDecisionCapabilities(
  script: ScriptForDecision | null,
  user: UserForDecision | null,
  hasPermission: (permission: string) => boolean
): ScriptDecisionCapabilities {
  const noUser: ScriptDecisionCapabilities = {
    canApprove: false,
    canReject: false,
    reasonIfDisabled: null,
  };

  if (!script || !user) return noUser;

  const hasApprovePerm = hasPermission("approve_scripts") || hasPermission("manage_script_status");
  const hasRejectPerm = hasPermission("reject_scripts") || hasPermission("manage_script_status");

  if (!hasApprovePerm && !hasRejectPerm) {
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled: "You do not have permission to approve or reject scripts.",
    };
  }

  const isCreator = script.created_by != null && script.created_by === user.id;
  const isAssignee = script.assigneeId != null && script.assigneeId === user.id;
  const isRegulator = user.role === "Regulator";
  const isSuperAdmin = user.role === "Super Admin";
  const canOverrideOwn = isSuperAdmin; // only Super Admin can decide on own script

  // Regulator: must be assignee
  if (isRegulator && !isAssignee) {
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled: "Only the assigned reviewer can approve or reject this script. This script is not assigned to you.",
    };
  }

  // Conflict of interest: creator cannot decide unless Super Admin
  if (isCreator && !canOverrideOwn) {
    return {
      canApprove: false,
      canReject: false,
      reasonIfDisabled:
        "You cannot approve/reject your own script. Ask an admin or the assigned reviewer to make the decision.",
    };
  }

  return {
    canApprove: hasApprovePerm,
    canReject: hasRejectPerm,
    reasonIfDisabled: null,
  };
}
