export type BlueprintEntry = Readonly<{
  id: string;
  title: string;
  description: string;
}>;

export type BlueprintRelationshipType = "parent" | "child" | "related" | "opposite" | "requires" | "supports";

export type BlueprintRelationship = Readonly<{
  from: string;
  to: string;
  type: BlueprintRelationshipType;
}>;

export type BlueprintDocument = Readonly<{
  version: string;
  id: string;
  title: string;
  description: string;
  entries: readonly (BlueprintEntry | BlueprintRelationship)[];
}>;

export type BlueprintValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type BlueprintValidationResult = Readonly<{
  valid: boolean;
  issues: readonly BlueprintValidationIssue[];
  hash: string;
}>;
