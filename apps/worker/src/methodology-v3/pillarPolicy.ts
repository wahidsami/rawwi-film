export type PillarId =
  | "P1_FaithAndSocialValues"
  | "P2_CriminalAndProhibitedActs"
  | "P3_PublicOrderAndSafety"
  | "P4_AuthorityAndGovernanceIntegrity"
  | "P5_MoralOutcomeAndNarrativeResponsibility";

const PILLAR_ARTICLE_MAP: Record<PillarId, number[]> = {
  P1_FaithAndSocialValues: [1, 2, 3, 5, 6, 7, 23, 24],
  P2_CriminalAndProhibitedActs: [4, 8, 9, 10, 11, 12, 15],
  P3_PublicOrderAndSafety: [11, 12, 13, 14, 19, 20, 21],
  P4_AuthorityAndGovernanceIntegrity: [13, 14, 15, 16, 18, 22],
  P5_MoralOutcomeAndNarrativeResponsibility: [17, 19, 20, 21, 22],
};

export function primaryPillarForArticle(articleId: number): PillarId {
  if (PILLAR_ARTICLE_MAP.P1_FaithAndSocialValues.includes(articleId)) return "P1_FaithAndSocialValues";
  if (PILLAR_ARTICLE_MAP.P2_CriminalAndProhibitedActs.includes(articleId)) return "P2_CriminalAndProhibitedActs";
  if (PILLAR_ARTICLE_MAP.P3_PublicOrderAndSafety.includes(articleId)) return "P3_PublicOrderAndSafety";
  if (PILLAR_ARTICLE_MAP.P4_AuthorityAndGovernanceIntegrity.includes(articleId)) return "P4_AuthorityAndGovernanceIntegrity";
  return "P5_MoralOutcomeAndNarrativeResponsibility";
}

export function secondaryPillarsForArticle(articleId: number): PillarId[] {
  const all = Object.keys(PILLAR_ARTICLE_MAP) as PillarId[];
  const primary = primaryPillarForArticle(articleId);
  return all.filter((p) => p !== primary && PILLAR_ARTICLE_MAP[p].includes(articleId));
}
