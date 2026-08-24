import type { Activity } from "./types";

type TokenKind = "word" | "number" | "string" | "operator" | "leftParen" | "rightParen" | "star" | "semicolon" | "eof";

type Token = {
  kind: TokenKind;
  value: string;
  position: number;
};

type Field = "distance" | "speed" | "name" | "type";
type ComparisonOperator = "=" | "!=" | "<" | "<=" | ">" | ">=" | "CONTAINS" | "LIKE";

type Expression =
  | { kind: "comparison"; field: Field; operator: ComparisonOperator; value: string | number }
  | { kind: "and"; left: Expression; right: Expression }
  | { kind: "or"; left: Expression; right: Expression }
  | { kind: "not"; expression: Expression };

const FIELD_ALIASES: Record<string, Field> = {
  distance: "distance",
  "距離": "distance",
  speed: "speed",
  avg_speed: "speed",
  "速度": "speed",
  name: "name",
  activity_name: "name",
  "名前": "name",
  "アクティビティ名": "name",
  type: "type",
  activity_type: "type",
  sport_type: "type",
  "種類": "type",
  "タイプ": "type",
  "アクティビティタイプ": "type",
};

export class ActivityQueryError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message}（${position + 1}文字目）`);
    this.name = "ActivityQueryError";
  }
}

export function compileActivityQuery(source: string): (activity: Activity) => boolean {
  const expression = new Parser(tokenize(source)).parse();
  return expression ? (activity) => evaluate(expression, activity) : () => true;
}

function evaluate(expression: Expression, activity: Activity): boolean {
  if (expression.kind === "and") return evaluate(expression.left, activity) && evaluate(expression.right, activity);
  if (expression.kind === "or") return evaluate(expression.left, activity) || evaluate(expression.right, activity);
  if (expression.kind === "not") return !evaluate(expression.expression, activity);

  const { field, operator, value } = expression;
  if (field === "distance" || field === "speed") {
    const actual = field === "distance"
      ? activity.distance / 1000
      : activity.movingTime > 0 ? (activity.distance / 1000) / (activity.movingTime / 3600) : 0;
    return compareNumbers(actual, operator, value as number);
  }

  const expected = String(value).toLocaleLowerCase();
  const candidates = field === "type"
    ? [activity.sportType.toLocaleLowerCase(), activity.kind.toLocaleLowerCase()]
    : [activity.name.toLocaleLowerCase()];
  const matched = candidates.some((actual) => compareText(actual, operator, expected));
  return operator === "!=" ? !candidates.some((actual) => actual === expected) : matched;
}

function compareNumbers(actual: number, operator: ComparisonOperator, expected: number): boolean {
  switch (operator) {
    case "=": return actual === expected;
    case "!=": return actual !== expected;
    case "<": return actual < expected;
    case "<=": return actual <= expected;
    case ">": return actual > expected;
    case ">=": return actual >= expected;
    default: return false;
  }
}

function compareText(actual: string, operator: ComparisonOperator, expected: string): boolean {
  switch (operator) {
    case "=": return actual === expected;
    case "!=": return actual !== expected;
    case "CONTAINS": return actual.includes(expected);
    case "LIKE": return likePattern(expected).test(actual);
    default: return false;
  }
}

function likePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*").replaceAll("_", ".");
  return new RegExp(`^${escaped}$`, "u");
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expression | null {
    if (this.current().kind === "eof") return null;

    if (this.isWord("SELECT")) {
      this.advance();
      this.consume("star", "SELECT の後には * を指定してください");
      this.consumeWord("FROM", "* の後には FROM を指定してください");
      const table = this.consume("word", "FROM の後には activities を指定してください");
      if (table.value.toLocaleLowerCase() !== "activities") {
        throw new ActivityQueryError("検索対象は activities です", table.position);
      }
      if (this.current().kind === "eof") return null;
      if (this.current().kind === "semicolon") {
        this.advance();
        if (this.current().kind !== "eof") throw new ActivityQueryError("; の後に文字があります", this.current().position);
        return null;
      }
      this.consumeWord("WHERE", "activities の後には WHERE を指定してください");
    } else if (this.isWord("WHERE")) {
      this.advance();
    }

    const expression = this.parseOr();
    if (this.current().kind === "semicolon") this.advance();
    if (this.current().kind !== "eof") {
      throw new ActivityQueryError(`「${this.current().value}」を解釈できません`, this.current().position);
    }
    return expression;
  }

  private parseOr(): Expression {
    let expression = this.parseAnd();
    while (this.isWord("OR")) {
      this.advance();
      expression = { kind: "or", left: expression, right: this.parseAnd() };
    }
    return expression;
  }

  private parseAnd(): Expression {
    let expression = this.parseNot();
    while (this.isWord("AND")) {
      this.advance();
      expression = { kind: "and", left: expression, right: this.parseNot() };
    }
    return expression;
  }

  private parseNot(): Expression {
    if (this.isWord("NOT")) {
      this.advance();
      return { kind: "not", expression: this.parseNot() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    if (this.current().kind === "leftParen") {
      this.advance();
      const expression = this.parseOr();
      this.consume("rightParen", "閉じかっこが必要です");
      return expression;
    }
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    const fieldToken = this.consume("word", "フィールド名が必要です");
    const field = FIELD_ALIASES[fieldToken.value.toLocaleLowerCase()];
    if (!field) throw new ActivityQueryError(`未対応のフィールドです: ${fieldToken.value}`, fieldToken.position);

    const operatorToken = this.current();
    let operator: ComparisonOperator;
    if (operatorToken.kind === "operator") {
      operator = operatorToken.value as ComparisonOperator;
    } else if (operatorToken.kind === "word" && ["CONTAINS", "LIKE"].includes(operatorToken.value.toLocaleUpperCase())) {
      operator = operatorToken.value.toLocaleUpperCase() as ComparisonOperator;
    } else {
      throw new ActivityQueryError("比較演算子が必要です", operatorToken.position);
    }
    this.advance();

    const valueToken = this.current();
    const numericField = field === "distance" || field === "speed";
    if (numericField) {
      if (["CONTAINS", "LIKE"].includes(operator)) {
        throw new ActivityQueryError(`${field} では ${operator} を使えません`, operatorToken.position);
      }
      if (valueToken.kind !== "number") throw new ActivityQueryError("数値が必要です", valueToken.position);
      this.advance();
      return { kind: "comparison", field, operator, value: Number(valueToken.value) };
    }

    if (["<", "<=", ">", ">="].includes(operator)) {
      throw new ActivityQueryError(`${field} では ${operator} を使えません`, operatorToken.position);
    }
    if (valueToken.kind !== "string" && valueToken.kind !== "word") {
      throw new ActivityQueryError("文字列が必要です", valueToken.position);
    }
    this.advance();
    return { kind: "comparison", field, operator, value: valueToken.value };
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private advance(): void {
    if (this.current().kind !== "eof") this.index++;
  }

  private isWord(value: string): boolean {
    return this.current().kind === "word" && this.current().value.toLocaleUpperCase() === value;
  }

  private consumeWord(value: string, message: string): Token {
    if (!this.isWord(value)) throw new ActivityQueryError(message, this.current().position);
    const token = this.current();
    this.advance();
    return token;
  }

  private consume(kind: TokenKind, message: string): Token {
    const token = this.current();
    if (token.kind !== kind) throw new ActivityQueryError(message, token.position);
    this.advance();
    return token;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index++;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "leftParen", value: character, position: index++ });
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "rightParen", value: character, position: index++ });
      continue;
    }
    if (character === "*") {
      tokens.push({ kind: "star", value: character, position: index++ });
      continue;
    }
    if (character === ";") {
      tokens.push({ kind: "semicolon", value: character, position: index++ });
      continue;
    }
    if (["=", "!", "<", ">"].includes(character)) {
      const position = index;
      const pair = source.slice(index, index + 2);
      const value = pair === "<>" ? "!=" : ["!=", "<=", ">="].includes(pair) ? pair : character;
      if (character === "!" && value !== "!=") throw new ActivityQueryError("! の後には = が必要です", position);
      tokens.push({ kind: "operator", value, position });
      index += pair === "<>" ? 2 : value.length;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      const position = index++;
      let value = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === quote) {
          if (source[index + 1] === quote) {
            value += quote;
            index += 2;
            continue;
          }
          index++;
          closed = true;
          break;
        }
        value += source[index++];
      }
      if (!closed) throw new ActivityQueryError("文字列が閉じられていません", position);
      tokens.push({ kind: "string", value, position });
      continue;
    }
    if (/\d/u.test(character) || (character === "." && /\d/u.test(source[index + 1] ?? ""))) {
      const position = index;
      while (/\d/u.test(source[index] ?? "")) index++;
      if (source[index] === ".") {
        index++;
        while (/\d/u.test(source[index] ?? "")) index++;
      }
      tokens.push({ kind: "number", value: source.slice(position, index), position });
      continue;
    }
    if (/[\p{L}_]/u.test(character)) {
      const position = index++;
      while (/[\p{L}\p{N}_]/u.test(source[index] ?? "")) index++;
      tokens.push({ kind: "word", value: source.slice(position, index), position });
      continue;
    }
    throw new ActivityQueryError(`使用できない文字です: ${character}`, index);
  }
  tokens.push({ kind: "eof", value: "", position: source.length });
  return tokens;
}
