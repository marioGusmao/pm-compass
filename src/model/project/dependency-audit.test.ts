import { describe, expect, it } from "vitest";
import { newTask } from "../__testing__/notes";
import type { ProjectTaskFields } from "./project-task";
import { buildProjectDependencyAudit } from "./dependency-audit";

function task(overrides: Partial<ProjectTaskFields> & { id: string; projectId?: string }) {
  return newTask({
    title: overrides.id,
    projectId: "p1",
    status: "todo",
    dependencies: [],
    filePath: `tasks/${overrides.id}.md`,
    ...overrides,
  });
}

describe("buildProjectDependencyAudit", () => {
  it("includes every depth of the selected project and excludes other projects from its rows", () => {
    const tasks = [
      task({ id: "root" }),
      task({ id: "child", parentId: "root" }),
      task({ id: "grandchild", parentId: "child" }),
      task({ id: "elsewhere", projectId: "p2" }),
    ];

    const audit = buildProjectDependencyAudit(tasks, "p1");

    expect(audit.rows.map((row) => row.task.id)).toEqual(["child", "grandchild", "root"]);
  });

  it("reports explicit prerequisites, reverse blockers and independent tasks", () => {
    const tasks = [
      task({ id: "first", title: "First" }),
      task({ id: "second", title: "Second", dependencies: ["first"] }),
      task({ id: "independent", title: "Independent" }),
    ];

    const audit = buildProjectDependencyAudit(tasks, "p1");
    const first = audit.rows.find((row) => row.task.id === "first")!;
    const second = audit.rows.find((row) => row.task.id === "second")!;
    const independent = audit.rows.find((row) => row.task.id === "independent")!;

    expect(first.blocks.map((ref) => ref.title)).toEqual(["Second"]);
    expect(second.dependsOn.map((ref) => ref.title)).toEqual(["First"]);
    expect(independent.dependsOn).toEqual([]);
    expect(independent.blocks).toEqual([]);
    expect(audit.dependencyCount).toBe(1);
    expect(audit.independentCount).toBe(1);
  });

  it("keeps external and missing references visible instead of dropping them", () => {
    const tasks = [
      task({ id: "inside", dependencies: ["outside", "missing"] }),
      task({ id: "outside", projectId: "p2", title: "Outside" }),
      task({ id: "external-dependent", projectId: "p2", title: "External dependent", dependencies: ["inside"] }),
    ];

    const row = buildProjectDependencyAudit(tasks, "p1").rows[0];

    expect(row.dependsOn).toEqual([
      expect.objectContaining({ id: "missing", title: "missing", external: true, missing: true }),
      expect.objectContaining({ id: "outside", title: "Outside", external: true, missing: false }),
    ]);
    expect(row.blocks).toEqual([
      expect.objectContaining({ id: "external-dependent", title: "External dependent", external: true, missing: false }),
    ]);
  });

  it("does not infer dependencies from dates or hierarchy", () => {
    const tasks = [
      task({ id: "parent", start: new Date(2026, 7, 20), due: new Date(2026, 7, 21) }),
      task({ id: "child", parentId: "parent", start: new Date(2026, 7, 22), due: new Date(2026, 7, 23) }),
    ];

    const audit = buildProjectDependencyAudit(tasks, "p1");

    expect(audit.dependencyCount).toBe(0);
    expect(audit.independentCount).toBe(2);
    expect(audit.rows.every((row) => row.dependsOn.length === 0 && row.blocks.length === 0)).toBe(true);
  });
});
