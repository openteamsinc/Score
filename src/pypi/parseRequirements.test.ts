import { describe, expect, it } from "bun:test";
import {
  parseRequirements,
  type StandardRequirement,
  type Requirement,
} from "./parseRequirements";

// Define the missing types based on the original file
type FileReferenceRequirement = Requirement & {
  reference_type: "requirement" | "constraint";
  filename: string;
};

describe("parseRequirements", () => {
  it("should parse standard requirements", async () => {
    const content = "requests>=2.8.1\npandas==1.3.0";
    const result = await parseRequirements(content);

    expect(result.length).toBe(2);
    expect(result[0].type).toBe("requirement");

    const req1 = result[0] as StandardRequirement;
    expect(req1.name).toBe("requests");
    expect(req1.specifiers?.[0]).toBe(">=2.8.1");

    const req2 = result[1] as StandardRequirement;
    expect(req2.name).toBe("pandas");
    expect(req2.specifiers?.[0]).toBe("==1.3.0");
  });

  it("should parse requirements with extras", async () => {
    const content = "requests[security,socks]>=2.8.1";
    const result = await parseRequirements(content);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe("requirement");

    const req = result[0] as StandardRequirement;
    expect(req.name).toBe("requests");
    expect(req.extras).toEqual(["security", "socks"]);
    expect(req.specifiers?.[0]).toBe(">=2.8.1");
  });

  it("should handle comments and line continuations", async () => {
    const content = `# This is a comment
requests>=2.8.1 \\
--hash=sha256:abcdef`;
    const result = await parseRequirements(content);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe("requirement");

    const req = result[0] as StandardRequirement;
    expect(req.name).toBe("requests");
    expect(req.hash_options?.[0]).toBe("--hash=sha256:abcdef");
  });

  it("should parse file references", async () => {
    const content = `-r base.txt
    -c constraints.txt`;
    const result = await parseRequirements(content);

    expect(result.length).toBe(2);
    expect(result[0].type).toBe("file_reference");

    // Use type assertion for file reference requirements
    const fileRef1 = result[0] as FileReferenceRequirement;
    expect(fileRef1.reference_type).toBe("requirement");
    expect(fileRef1.filename).toBe("base.txt");

    const fileRef2 = result[1] as FileReferenceRequirement;
    expect(fileRef2.reference_type).toBe("constraint");
    expect(fileRef2.filename).toBe("constraints.txt");
  });
});
