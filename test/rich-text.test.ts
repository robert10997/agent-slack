import { describe, expect, test } from "bun:test";
import { parseInlineElements, textToRichTextBlocks } from "../src/slack/rich-text.ts";

describe("parseInlineElements", () => {
  test("plain text returns single text element", () => {
    expect(parseInlineElements("Hello world")).toEqual([{ type: "text", text: "Hello world" }]);
  });

  test("*bold* is parsed with bold style", () => {
    expect(parseInlineElements("Hello *world*!")).toEqual([
      { type: "text", text: "Hello " },
      { type: "text", text: "world", style: { bold: true } },
      { type: "text", text: "!" },
    ]);
  });

  test("_italic_ is parsed with italic style", () => {
    expect(parseInlineElements("This is _important_")).toEqual([
      { type: "text", text: "This is " },
      { type: "text", text: "important", style: { italic: true } },
    ]);
  });

  test("~strike~ is parsed with strike style", () => {
    expect(parseInlineElements("~done~")).toEqual([
      { type: "text", text: "done", style: { strike: true } },
    ]);
  });

  test("`code` is parsed with code style", () => {
    expect(parseInlineElements("Run `npm install`")).toEqual([
      { type: "text", text: "Run " },
      { type: "text", text: "npm install", style: { code: true } },
    ]);
  });

  test("<url|label> is parsed as link with text", () => {
    expect(parseInlineElements("Visit <https://example.com|Example>")).toEqual([
      { type: "text", text: "Visit " },
      { type: "link", url: "https://example.com", text: "Example" },
    ]);
  });

  test("<url> is parsed as link without text", () => {
    expect(parseInlineElements("See <https://example.com>")).toEqual([
      { type: "text", text: "See " },
      { type: "link", url: "https://example.com" },
    ]);
  });

  test("<@U123> is parsed as user mention", () => {
    expect(parseInlineElements("ping <@U123ABC>")).toEqual([
      { type: "text", text: "ping " },
      { type: "user", user_id: "U123ABC" },
    ]);
  });

  test("<#C123|channel> is parsed as channel mention", () => {
    expect(parseInlineElements("see <#C0G9QF9GW|general>")).toEqual([
      { type: "text", text: "see " },
      { type: "channel", channel_id: "C0G9QF9GW" },
    ]);
  });

  test("<!here> is parsed as broadcast", () => {
    expect(parseInlineElements("<!here> heads up")).toEqual([
      { type: "broadcast", range: "here" },
      { type: "text", text: " heads up" },
    ]);
  });

  test("<!channel> is parsed as broadcast", () => {
    expect(parseInlineElements("<!channel> alert")).toEqual([
      { type: "broadcast", range: "channel" },
      { type: "text", text: " alert" },
    ]);
  });

  test("<!everyone> is parsed as broadcast", () => {
    expect(parseInlineElements("<!everyone>")).toEqual([{ type: "broadcast", range: "everyone" }]);
  });

  test("<!subteam^S123> is parsed as usergroup mention", () => {
    expect(parseInlineElements("notify <!subteam^S123>")).toEqual([
      { type: "text", text: "notify " },
      { type: "usergroup", usergroup_id: "S123" },
    ]);
  });

  test("<!subteam^S123|@team> is parsed as usergroup mention", () => {
    expect(parseInlineElements("cc <!subteam^S04F2M3GE|@team-eng>")).toEqual([
      { type: "text", text: "cc " },
      { type: "usergroup", usergroup_id: "S04F2M3GE" },
    ]);
  });
});

describe("textToRichTextBlocks", () => {
  test("plain text returns null", () => {
    expect(textToRichTextBlocks("Hello world")).toBeNull();
  });

  test("bullet list with - prefix", () => {
    const result = textToRichTextBlocks("- Item 1\n- Item 2\n- Item 3")!;
    expect(result).not.toBeNull();
    const lists = result[0]!.elements.filter((e) => e.type === "rich_text_list");
    expect(lists).toHaveLength(1);
    const list = lists[0]!;
    expect(list.type === "rich_text_list" && list.elements).toHaveLength(3);
  });

  test("bullet list with bullet character", () => {
    expect(textToRichTextBlocks("• Item 1\n• Item 2")).not.toBeNull();
  });

  test("sub-bullets with indentation", () => {
    const result = textToRichTextBlocks("- Main 1\n- Main 2\n  - Sub 2a\n  - Sub 2b\n- Main 3")!;
    expect(result).not.toBeNull();
    const lists = result[0]!.elements.filter((e) => e.type === "rich_text_list");
    expect(lists).toHaveLength(3); // main, sub, main
    expect((lists[1] as { indent?: number }).indent).toBe(1);
  });

  test("white bullet sub-bullets under bullet", () => {
    const result = textToRichTextBlocks("• Top level\n  ◦ Sub-bullet\n  ◦ Another sub")!;
    expect(result).not.toBeNull();
    const lists = result[0]!.elements.filter((e) => e.type === "rich_text_list");
    expect(lists).toHaveLength(2);
    expect((lists[1] as { indent?: number }).indent).toBe(1);
  });

  test("mixed text and bullets", () => {
    const result = textToRichTextBlocks("Here is a list:\n- Item 1\n- Item 2")!;
    expect(result).not.toBeNull();
    expect(result[0]!.elements[0]!.type).toBe("rich_text_section");
    expect(result[0]!.elements[1]!.type).toBe("rich_text_list");
  });

  test("numbered list", () => {
    const result = textToRichTextBlocks("1. First\n2. Second\n3. Third")!;
    expect(result).not.toBeNull();
    const list = result[0]!.elements.find((e) => e.type === "rich_text_list")!;
    expect((list as { style: string }).style).toBe("ordered");
  });

  test("bold text in list items is parsed", () => {
    const result = textToRichTextBlocks("- *Bold item*\n- Normal item")!;
    expect(result).not.toBeNull();
    const list = result[0]!.elements.find((e) => e.type === "rich_text_list") as {
      elements: { elements: unknown[] }[];
    };
    expect(list.elements[0]!.elements).toEqual([
      { type: "text", text: "Bold item", style: { bold: true } },
    ]);
  });

  test("code block is preserved", () => {
    const result = textToRichTextBlocks("- Item\n```\ncode here\n```")!;
    expect(result).not.toBeNull();
    expect(result[0]!.elements.find((e) => e.type === "rich_text_preformatted")).toBeDefined();
  });

  test("blockquote is preserved", () => {
    const result = textToRichTextBlocks("- Item\n> quoted text")!;
    expect(result).not.toBeNull();
    expect(result[0]!.elements.find((e) => e.type === "rich_text_quote")).toBeDefined();
  });

  test("user mentions in list items are preserved", () => {
    const result = textToRichTextBlocks("- ping <@U123>\n- notify <@U456>")!;
    expect(result).not.toBeNull();
    const list = result[0]!.elements.find((e) => e.type === "rich_text_list") as {
      elements: { elements: unknown[] }[];
    };
    expect(list.elements[0]!.elements).toEqual([
      { type: "text", text: "ping " },
      { type: "user", user_id: "U123" },
    ]);
    expect(list.elements[1]!.elements).toEqual([
      { type: "text", text: "notify " },
      { type: "user", user_id: "U456" },
    ]);
  });

  test("channel mentions and broadcasts in list items are preserved", () => {
    const result = textToRichTextBlocks("- post in <#C123|general>\n- <!here> check this")!;
    expect(result).not.toBeNull();
    const list = result[0]!.elements.find((e) => e.type === "rich_text_list") as {
      elements: { elements: unknown[] }[];
    };
    expect(list.elements[0]!.elements).toEqual([
      { type: "text", text: "post in " },
      { type: "channel", channel_id: "C123" },
    ]);
    expect(list.elements[1]!.elements).toEqual([
      { type: "broadcast", range: "here" },
      { type: "text", text: " check this" },
    ]);
  });
});
