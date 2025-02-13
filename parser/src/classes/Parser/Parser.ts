import { extname, join } from "https://deno.land/std@0.215.0/path/mod.ts";
import Tags, { DocBlock } from "./Tags.ts";
import { error_message, get_unique } from "../../utils/functions.ts";
import SelectorTag from "../Tags/SelectorTag.ts";
import Tag from "../Tags/Tag.ts";
import { AnyTag } from "../../utils/types.ts";

export type CategoryCallbackFunction = (
  args: DocBlock,
  has_subcategory: boolean,
) => void;

export default class Parser {
  categories: {
    [key: string]: {
      subcategory: boolean;
      add_item: CategoryCallbackFunction;
      create_subcategory?: CategoryCallbackFunction;
    };
  };
  tags: Tags;
  default_category: string | undefined;
  setup: boolean;

  constructor() {
    this.categories = {};
    this.tags = new Tags();
    this.default_category = undefined;
    this.setup = false;

    /* These tags are hardcoded and are essential for the functioning of
		this class.*/
    this.tags.add_tag(new Tag("subcategory", 1), true);
  }

  add_tag(tag: AnyTag, allowed_as_global: boolean = false): this {
    this.tags.add_tag(tag, allowed_as_global);

    return this;
  }

  add_category(
    name: string,
    has_subcategory: boolean,
    add_item: CategoryCallbackFunction,
    create_subcategory?: CategoryCallbackFunction,
  ): this {
    if (this.setup) {
      throw new Error("Can't add new categories after parsing.");
    }

    this.categories[name] = {
      subcategory: has_subcategory,
      add_item: add_item,
      create_subcategory: create_subcategory,
    };

    if (!this.default_category) {
      this.default_category = name;
    }

    return this;
  }

  set_default_category(default_category: string) {
    if (this.setup) {
      throw new Error("Can't set new default category after parsing.");
    } else if (!this.categories[default_category]) {
      throw new Error(`Category '${default_category}' doesn't exist.`);
    }

    this.default_category = default_category;
  }

  private parse_file(path: string) {
    const blocks = this.tags.process_file(path);

    for (const line_number in blocks) {
      const block = blocks[line_number];
      const global = get_unique(block, "global") === "true";
      const category = get_unique(block, "category") ?? this.default_category!;

      try {
        if (
          this.categories[category].subcategory &&
          !block["subcategory"]
        ) {
          throw (
            `Missing '@subcategory' tag for '@category ` +
            `${category}'.`
          );
        } else if (
          global &&
          this.categories[category].create_subcategory
        ) {
          this.categories[category].create_subcategory!(
            block,
            this.categories[category].subcategory,
          );
        } else if (!global) {
          this.categories[category].add_item!(
            block,
            this.categories[category].subcategory,
          );
        }
      } catch (e) {
        if (e instanceof Error) {
          throw e;
        }
        error_message(path, Number(line_number), e);
      }
    }
  }

  private parse_directory(directory: string) {
    for (const d of Deno.readDirSync(directory)) {
      if (d.isDirectory) {
        this.parse_directory(join(directory, d.name));
      } else if (d.isFile && extname(d.name).toLowerCase() == ".lua") {
        this.parse_file(join(directory, d.name));
      }
    }
  }

  parse(directory: string): this {
    if (!this.setup) {
      if (this.default_category === undefined) {
        throw new Error("There are no categories defined.");
      }

      this.add_tag(
        new SelectorTag("category", Object.keys(this.categories)),
        true,
      );
      this.setup = true;
    }

    this.parse_directory(directory);

    return this;
  }
}
