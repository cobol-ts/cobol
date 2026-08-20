import {allButLastSegment, camelCase, camelCaseToWords, capitalizeFirstLetter, ellipsesInMiddle, firstSegment, lastSegment, nameWithOptions, parseAttributeValue, safeId, toGitStoragePath} from "./strings.utilities";


describe("camelCaseToWords", () => {
    it("converts simple camelCase strings to words", () => {
        expect(camelCaseToWords("thisText")).toBe("This Text");
        expect(camelCaseToWords("anotherExample")).toBe("Another Example");
    });

    it("handles multiple uppercase letters correctly", () => {
        expect(camelCaseToWords("HTMLParserTest")).toBe("HTML Parser Test");
        expect(camelCaseToWords("XmlHTTPRequest")).toBe("Xml HTTP Request");
    });

    it("handles single word strings", () => {
        expect(camelCaseToWords("example")).toBe("Example");
    });

    it("handles strings with numbers", () => {
        expect(camelCaseToWords("test123String")).toBe("Test 123 String");
        expect(camelCaseToWords("123startHere")).toBe("123 Start Here");
        expect(camelCaseToWords("this1Is2ATest3")).toBe("This 1 Is 2 A Test 3");
    });

    it("handles strings with special characters", () => {
        expect(camelCaseToWords("test_with_special_@")).toBe("Test_with_special_@");
        expect(camelCaseToWords("another-Test")).toBe("Another-Test");
    });

    it("handles empty strings", () => {
        expect(camelCaseToWords("")).toBe("");
    });

    it("handles strings with existing spaces", () => {
        expect(camelCaseToWords("thisText AlreadyFormatted")).toBe("This Text Already Formatted");
    });

    it("handles strings that are already properly formatted", () => {
        expect(camelCaseToWords("Already Proper")).toBe("Already Proper");
    });

    it("trims leading and trailing spaces", () => {
        expect(camelCaseToWords("  thisText  ")).toBe("This Text");
    });
});


describe("capitalizeFirstLetter", () => {
    it("capitalizes the first letter of a string", () => {
        expect(capitalizeFirstLetter("test")).toBe("Test");
        expect(capitalizeFirstLetter("another")).toBe("Another");
    });

    it("handles empty strings", () => {
        expect(capitalizeFirstLetter("")).toBe("");
    });
    it("handles undefined and nulls", () => {
        expect(capitalizeFirstLetter(null as any)).toBe(null);
        expect(capitalizeFirstLetter(undefined as any)).toBe(undefined);
    });

    it("handles strings with numbers", () => {
        expect(capitalizeFirstLetter("123test")).toBe("123test");
    });

    it("handles strings with special characters", () => {
        expect(capitalizeFirstLetter("@test")).toBe("@test");
    });

    it("handles strings with existing spaces", () => {
        expect(capitalizeFirstLetter("  test  ")).toBe("  test  ");
    });

    it("handles strings that are already properly formatted", () => {
        expect(capitalizeFirstLetter("Test")).toBe("Test");
    });
});


describe("camelCase", () => {

    test("converts space-separated words to camelCase", () => {
        expect(camelCase("hello world")).toBe("helloWorld");
    });

    test("handles single-word input", () => {
        expect(camelCase("hello")).toBe("hello");
    });

    test("converts snake_case to camelCase", () => {
        expect(camelCase("some_value_here")).toBe("someValueHere");
    });

    test("converts kebab-case to camelCase", () => {
        expect(camelCase("get-this-done")).toBe("getThisDone");
    });

    test("handles mixed separators (spaces, underscores, hyphens)", () => {
        expect(camelCase("one_two-three four")).toBe("oneTwoThreeFour");
    });

    test("ignores leading and trailing spaces", () => {
        expect(camelCase("   leading spaces  ")).toBe("leadingSpaces");
    });

    test("handles uppercase input", () => {
        expect(camelCase("MAKE IT WORK")).toBe("makeItWork");
    });

    test("returns empty string for empty input", () => {
        expect(camelCase("")).toBe("");
    });

    test("handles input with special characters", () => {
        expect(camelCase("hello@world!")).toBe("hello@world");
    });

    test("handles numeric and alphanumeric input", () => {
        expect(camelCase("convert 123 to words")).toBe("convert123ToWords");
        expect(camelCase("mix123Words")).toBe("mix123words");
    });

    test("handles repetitive separators", () => {
        expect(camelCase("----repeated---hyphens__and_spaces ")).toBe("repeatedHyphensAndSpaces");
    });

    test("converts dash-only input to empty string", () => {
        expect(camelCase("----")).toBe("");
    });

    test("preserves case for words after first word", () => {
        expect(camelCase("UPPER lowercase MixEd")).toBe("upperLowercaseMixed");
    });

});


describe("ellipsesInMiddle", () => {
    test("returns full string if within maxLength", () => {
        expect(ellipsesInMiddle("short", 10)).toBe("short");
    });

    test("truncates with default ellipses in the middle", () => {
        expect(ellipsesInMiddle("abcdefghijklmno", 11)).toBe("abcd...lmno");
    });

    test("truncates with custom ellipses", () => {
        expect(ellipsesInMiddle("abcdefghijklmno", 11, "[...]")).toBe("abc[...]mno");
    });

    test("returns only ellipsis if maxLength is too small", () => {
        expect(ellipsesInMiddle("abcdefghij", 4)).toBe("...");
        expect(ellipsesInMiddle("abcdefghij", 5, "[...]")).toBe("[...]");
    });

    test("handles edge cases with extremely small maxLength", () => {
        expect(ellipsesInMiddle("abcdefghij", 3)).toBe("...");
        expect(ellipsesInMiddle("abcdefghij", 2, "--")).toBe("--");
    });
});


describe("nameWithOptions", () => {
    it("parses simple name", () => {
        expect(nameWithOptions("name")).toEqual({ name: "name", options: [] });
    });

    it("parses name with single option", () => {
        expect(nameWithOptions("name(option)")).toEqual({ name: "name", options: ["option"] });
    });

    it("parses name with spaces and single option", () => {
        expect(nameWithOptions("name (option)")).toEqual({ name: "name", options: ["option"] });
    });

    it("parses name with multiple options", () => {
        expect(nameWithOptions("name(opt1,opt2)")).toEqual({ name: "name", options: ["opt1", "opt2"] });
    });

    it("parses name with multiple options and spaces", () => {
        expect(nameWithOptions("name (opt1, opt2)")).toEqual({ name: "name", options: ["opt1", "opt2"] });
    });

    it("parses empty options", () => {
        expect(nameWithOptions("name()")).toEqual({ name: "name", options: [] });
    });

    it("trims unnecessary whitespace", () => {
        expect(nameWithOptions("  name   (  opt1 ,  opt2  )  ")).toEqual({ name: "name", options: ["opt1", "opt2"] });
    });

    it("handles completely empty input", () => {
        expect(nameWithOptions("")).toEqual({ name: "", options: [] });
    });
});


describe("parseAttributeValue", () => {
    it("should parse valid attribute:value strings correctly", () => {
        expect(parseAttributeValue("color:red")).toEqual({ attribute: "color", value: "red" });
        expect(parseAttributeValue("size:large")).toEqual({ attribute: "size", value: "large" });
    });

    it("should handle no :", () => {
        expect(parseAttributeValue("colorred")).toEqual({ attribute: "colorred" });
    });
    it("should throw an error for invalid formats", () => {
        expect(() => parseAttributeValue("color:")).toThrowError("Invalid attribute:value format: 'color:'");
        expect(() => parseAttributeValue(":red")).toThrowError("Invalid attribute:value format: ':red'");
        expect(() => parseAttributeValue("")).toThrowError("Invalid attribute:value format: ''");
    });
});

describe("lastSegment", () => {
    it("should return the last segment of a string defined by the marker", () => {
        expect(lastSegment('one\\two')).toEqual('two')
        expect(lastSegment('one/two')).toEqual('two')
        expect(lastSegment('one/two', '/')).toEqual('two')
        expect(lastSegment('one/two', '.')).toEqual('one/two')
        expect(lastSegment(undefined as any, '.')).toEqual(undefined)
    })
})
describe("allButLastSegment", () => {
    it("should return all but the last segment of a string defined by the marker", () => {
        expect(allButLastSegment('one\\two')).toEqual('one')
        expect(allButLastSegment('one/two')).toEqual('one')
        expect(allButLastSegment('one/two/three')).toEqual('one/two')
        expect(allButLastSegment('one/two/three', '/')).toEqual('one/two')
        expect(allButLastSegment('one/two/three', '\\')).toEqual('')
    })
})

describe("firstSegment", () => {
    it("should return the first segment of a string defined by the marker", () => {
        expect(firstSegment('one/two', '/')).toEqual('one')
        expect(firstSegment('one/two', '.')).toEqual('one/two')
        expect(firstSegment(undefined as any, '.')).toEqual(undefined)
    })
})
describe('toGitStoragePath', () => {
    it('partitions long names correctly', () => {
        expect(toGitStoragePath('abcdefghij')).toBe('ab/cd/efghij');
    });
    it('works on exactly 5 chars', () => {
        expect(toGitStoragePath('12345')).toBe('12/34/5');
    });
    it('throws on short names', () => {
        expect(() => toGitStoragePath('abcd')).toThrow(/at least 5 chars/);
    });
});

describe("safeId", () => {
    test("replaces dots with underscores", () => {
        expect(safeId("page1.section3.para6")).toBe("page1_section3_para6");
    });

    test("collapses and trims underscores from mixed junk", () => {
        expect(safeId("a..b...c")).toBe("a_b_c");
        expect(safeId("__a__b__")).toBe("a_b");
        expect(safeId("a---b")).toBe("a---b"); // dashes are preserved
    });

    test("replaces spaces and punctuation with underscores", () => {
        expect(safeId("hello world")).toBe("hello_world");
        expect(safeId("hello/world?yes")).toBe("hello_world_yes");
        expect(safeId("a (b) [c]")).toBe("a_b_c");
    });

    test("ensures the id starts with a letter by prefixing", () => {
        expect(safeId("123")).toBe("id_123");
        expect(safeId("_startsWithUnderscore")).toBe("startsWithUnderscore");
        expect(safeId("-dash")).toBe("id_-dash");
    });

    test("uses custom prefix", () => {
        expect(safeId("123", { prefix: "f" })).toBe("f_123");
        expect(safeId("", { prefix: "f" })).toBe("f");
    });

    test("handles empty / whitespace-only input", () => {
        expect(safeId("")).toBe("id");
        expect(safeId("   ")).toBe("id");
        expect(safeId("...", { prefix: "x" })).toBe("x");
    });

    test("is idempotent", () => {
        const x = "page1.section3.para6";
        expect(safeId(safeId(x))).toBe(safeId(x));
    });

    test("respects maxLen", () => {
        const long = "a.".repeat(200); // becomes lots of "a_"
        const out = safeId(long, { maxLen: 20 });
        expect(out.length).toBeLessThanOrEqual(20);
        expect(/^[A-Za-z]/.test(out)).toBe(true);
    });

    test("only contains [A-Za-z0-9_-] after normalisation", () => {
        const out = safeId("Äß中 文.page!*&^%$#@!");
        expect(out).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
    });
});
