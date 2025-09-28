import type { IdMapping } from "../types/chat";

type DynamicFileLike = { _id: string };

type BranchLike = { _id: string };

type BulletPointLike = {
  _id: string;
  branches?: BranchLike[];
};

type ProjectLike = {
  _id: string;
  bulletPoints?: BulletPointLike[];
};

type BuildIdMappingParams = {
  dynamicFiles?: DynamicFileLike[] | null;
  projects?: ProjectLike[] | null;
  /**
   * Optional lookup when bullet points are loaded separately from projects.
   */
  bulletPointsByProject?: Record<string, BulletPointLike[] | undefined> | null;
  /**
   * Optional lookup when branches are loaded separately from bullet points.
   */
  branchesByBulletPoint?: Record<string, BranchLike[] | undefined> | null;
};

/**
 * Builds a stable simple-id <-> Convex id mapping used for citations.
 * The logic is shared between the streaming API and the client renderer to
 * avoid drift that could break citation lookups.
 */
export function buildIdMapping({
  dynamicFiles,
  projects,
  bulletPointsByProject,
  branchesByBulletPoint,
}: BuildIdMappingParams): IdMapping {
  const mapping: IdMapping = { forward: {}, reverse: {} };

  let pageCounter = 0;
  dynamicFiles?.forEach((page) => {
    if (!page?._id) return;
    pageCounter += 1;
    const simpleId = `PG${pageCounter}`;
    mapping.forward[page._id] = simpleId;
    mapping.reverse[simpleId] = page._id;
  });

  let projectCounter = 0;
  let bulletCounter = 0;
  let branchCounter = 0;

  projects?.forEach((project) => {
    if (!project?._id) return;
    projectCounter += 1;
    const projectSimpleId = `P${projectCounter}`;
    mapping.forward[project._id] = projectSimpleId;
    mapping.reverse[projectSimpleId] = project._id;

    const projectBullets =
      project.bulletPoints ?? bulletPointsByProject?.[project._id] ?? [];

    projectBullets?.forEach((bullet) => {
      if (!bullet?._id) return;
      bulletCounter += 1;
      const bulletSimpleId = `B${bulletCounter}`;
      mapping.forward[bullet._id] = bulletSimpleId;
      mapping.reverse[bulletSimpleId] = bullet._id;

      const bulletBranches =
        bullet.branches ?? branchesByBulletPoint?.[bullet._id] ?? [];

      bulletBranches?.forEach((branch) => {
        if (!branch?._id) return;
        branchCounter += 1;
        const branchSimpleId = `BR${branchCounter}`;
        mapping.forward[branch._id] = branchSimpleId;
        mapping.reverse[branchSimpleId] = branch._id;
      });
    });
  });

  return mapping;
}
