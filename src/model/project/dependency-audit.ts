/** A complete, read-only inventory of the explicit dependencies touching one project. */
import { compareTitles } from "../base-task";
import type { ProjectTask } from "./project-task";

/** One end named by a dependency list. External means it is outside the selected project;
 * missing is the stronger case where the id no longer names a task at all. */
export interface DependencyAuditRef {
  id: string;
  title: string;
  projectId?: string;
  external: boolean;
  missing: boolean;
}

export interface DependencyAuditRow {
  task: ProjectTask;
  dependsOn: DependencyAuditRef[];
  blocks: DependencyAuditRef[];
}

export interface ProjectDependencyAudit {
  rows: DependencyAuditRow[];
  /** Unique stored directed edges with at least one end in the project. */
  dependencyCount: number;
  independentCount: number;
}

function compareRefs(a: DependencyAuditRef, b: DependencyAuditRef): number {
  return compareTitles(a.title, b.title) || a.id.localeCompare(b.id);
}

/**
 * Builds the exhaustive table behind the project's all-dependencies mode. The project is
 * selected by `projectId`, which naturally includes every task depth: nesting changes
 * `parentId`, never project ownership. Dates and hierarchy are deliberately ignored; only
 * ids explicitly stored in `dependencies` become relationships.
 */
export function buildProjectDependencyAudit(
  allTasks: ProjectTask[],
  projectId: string,
): ProjectDependencyAudit {
  const byId = new Map(allTasks.map((task) => [task.id, task]));
  const inProject = new Set(allTasks.filter((task) => task.projectId === projectId).map((task) => task.id));

  const ref = (id: string): DependencyAuditRef => {
    const task = byId.get(id);
    return {
      id,
      title: task?.title ?? id,
      projectId: task?.projectId,
      external: !task || task.projectId !== projectId,
      missing: !task,
    };
  };

  const blockedBy = new Map<string, string[]>();
  const touchedEdges = new Set<string>();
  for (const dependent of allTasks) {
    for (const prerequisiteId of dependent.dependencies) {
      const blockers = blockedBy.get(prerequisiteId) ?? [];
      blockers.push(dependent.id);
      blockedBy.set(prerequisiteId, blockers);
      if (inProject.has(dependent.id) || inProject.has(prerequisiteId)) {
        touchedEdges.add(`${prerequisiteId}->${dependent.id}`);
      }
    }
  }

  const rows = allTasks
    .filter((task) => task.projectId === projectId)
    .map((task): DependencyAuditRow => ({
      task,
      dependsOn: task.dependencies.map(ref).sort(compareRefs),
      blocks: (blockedBy.get(task.id) ?? []).map(ref).sort(compareRefs),
    }))
    .sort((a, b) => compareTitles(a.task.title, b.task.title) || a.task.id.localeCompare(b.task.id));

  return {
    rows,
    dependencyCount: touchedEdges.size,
    independentCount: rows.filter((row) => row.dependsOn.length === 0 && row.blocks.length === 0).length,
  };
}
