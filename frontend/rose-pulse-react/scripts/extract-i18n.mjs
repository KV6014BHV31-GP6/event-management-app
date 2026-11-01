import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import generateModule from "@babel/generator";
import * as types from "@babel/types";
const traverse = traverseModule.default;
const generate = generateModule.default;
const keys = new Set();
const branded = new Set(["ROSE", "PULSE", "ROSE · PULSE", "·", "EN"]);
const human = (value) =>
  /[A-Za-z]/.test(value) && !branded.has(value) && value.length > 1;
function translated(value) {
  keys.add(value);
  return types.callExpression(types.identifier("tr"), [
    types.stringLiteral(value),
  ]);
}
for (const file of ["src/App.jsx", "src/offline/OfflineWorkspace.jsx"]) {
  const source = readFileSync(file, "utf8").replace(
    /^import \{ tr \} from ["']\.\.?\/i18n\/index\.js["'];?\r?\n/gm,
    "",
  );
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
  traverse(ast, {
    CallExpression(path) {
      if (
        types.isIdentifier(path.node.callee, { name: "tr" }) &&
        types.isStringLiteral(path.node.arguments[0])
      )
        keys.add(path.node.arguments[0].value);
    },
    JSXText(path) {
      const normalized = path.node.value.replace(/\s+/g, " ").trim();
      if (!human(normalized)) return;
      const space = !path.node.value.includes("\n");
      const parts = [];
      if (space && /^\s/.test(path.node.value)) parts.push(types.jsxText(" "));
      parts.push(types.jsxExpressionContainer(translated(normalized)));
      if (space && /\s$/.test(path.node.value)) parts.push(types.jsxText(" "));
      path.replaceWithMultiple(parts);
      path.skip();
    },
    JSXAttribute(path) {
      if (
        [
          "label",
          "placeholder",
          "help",
          "title",
          "aria-label",
          "alt",
          "eyebrow",
        ].includes(path.node.name.name) &&
        types.isStringLiteral(path.node.value) &&
        human(path.node.value.value)
      )
        path.node.value = types.jsxExpressionContainer(
          translated(path.node.value.value),
        );
    },
    JSXExpressionContainer(path) {
      const expression = path.node.expression;
      const convert = (node) => {
        if (types.isStringLiteral(node) && human(node.value))
          return translated(node.value);
        if (types.isConditionalExpression(node)) {
          node.consequent = convert(node.consequent);
          node.alternate = convert(node.alternate);
        }
        return node;
      };
      path.node.expression = convert(expression);
    },
  });
  traverse(ast, {
    CallExpression(path) {
      const attribute = path.findParent((parent) => parent.isJSXAttribute());
      if (
        attribute &&
        ![
          "label",
          "placeholder",
          "help",
          "title",
          "aria-label",
          "alt",
          "eyebrow",
        ].includes(attribute.node.name.name) &&
        types.isIdentifier(path.node.callee, { name: "tr" }) &&
        types.isStringLiteral(path.node.arguments[0])
      )
        path.replaceWith(path.node.arguments[0]);
    },
  });
  ast.program.body.unshift(
    types.importDeclaration(
      [types.importSpecifier(types.identifier("tr"), types.identifier("tr"))],
      types.stringLiteral(
        file.includes("/offline/") ? "../i18n/index.js" : "./i18n/index.js",
      ),
    ),
  );
  writeFileSync(file, generate(ast, { retainLines: false }).code + "\n");
}
for (const file of [
  "frontend/live/api.mjs",
  "frontend/live/session.mjs",
  "frontend/live/create-event.mjs",
  "frontend/live/edit-event.mjs",
  "frontend/live/registration.mjs",
  "frontend/live/registrations-page.mjs",
  "frontend/rose-pulse-react/src/service.js",
]) {
  const path = "../" + file.replace(/^frontend\//, "");
  const ast = parse(readFileSync(path, "utf8"), { sourceType: "module" });
  traverse(ast, {
    StringLiteral(path) {
      const value = path.node.value;
      if (
        value.length > 12 &&
        value.includes(" ") &&
        /^[A-Z]/.test(value) &&
        !value.includes("<") &&
        !value.startsWith("Bearer ")
      )
        keys.add(value);
    },
  });
}
mkdirSync("src/i18n", { recursive: true });
const previous = JSON.parse(readFileSync("src/i18n/en.json", "utf8") || "{}");
for (const key of keys) previous[key] = key;
for (const key of [
  "alert",
  "status",
  "current-password",
  "new-password",
  "eager",
  "lazy",
  "event",
  "events",
  "is-active",
  "login",
  "manage",
  "organizer",
  "page",
  "password",
  "registrations",
  "signup",
  "text",
  "ticket",
  "user",
  "users",
])
  delete previous[key];
writeFileSync(
  "src/i18n/en.json",
  JSON.stringify(Object.fromEntries(Object.entries(previous).sort()), null, 2) +
    "\n",
);
console.log(`${Object.keys(previous).length} central English entries`);
