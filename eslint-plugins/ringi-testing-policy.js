const BANNED_VITEST_METHODS = new Set(["mock", "spyOn", "stubGlobal"]);

const getImportedSpecifierName = function getImportedSpecifierName(specifier) {
  if (!specifier) {
    return null;
  }

  if (specifier.type === "Identifier") {
    return specifier.name;
  }

  if (specifier.type === "Literal" && typeof specifier.value === "string") {
    return specifier.value;
  }

  return null;
};

const getMemberPropertyName = function getMemberPropertyName(memberExpression) {
  if (
    !memberExpression.computed &&
    memberExpression.property.type === "Identifier"
  ) {
    return memberExpression.property.name;
  }

  if (
    memberExpression.computed &&
    memberExpression.property.type === "Literal" &&
    typeof memberExpression.property.value === "string"
  ) {
    return memberExpression.property.value;
  }

  return null;
};

const getCalledMemberExpression = function getCalledMemberExpression(
  callExpression
) {
  const callee =
    callExpression.callee.type === "ChainExpression"
      ? callExpression.callee.expression
      : callExpression.callee;

  if (callee.type !== "MemberExpression") {
    return null;
  }

  return callee;
};

const resolveVariable = function resolveVariable(sourceCode, node, name) {
  if (!sourceCode || typeof sourceCode.getScope !== "function") {
    return null;
  }

  let scope = sourceCode.getScope(node);

  while (scope) {
    const variable =
      scope.set?.get?.(name) ??
      scope.variables?.find((candidate) => candidate.name === name) ??
      null;

    if (variable) {
      return variable;
    }

    scope = scope.upper ?? null;
  }

  return null;
};

const isVitestViImport = function isVitestViImport(variable) {
  if (!variable?.defs) {
    return false;
  }

  return variable.defs.some((definition) => {
    if (definition.type !== "ImportBinding") {
      return false;
    }

    const importSpecifier = definition.node;
    const importDeclaration = importSpecifier?.parent;
    const importedName = getImportedSpecifierName(importSpecifier?.imported);
    const source = importDeclaration?.source?.value;

    return source === "vitest" && importedName === "vi";
  });
};

const isVitestViReference = function isVitestViReference(sourceCode, node) {
  const variable = resolveVariable(sourceCode, node, node.name);

  if (!variable) {
    return node.name === "vi";
  }

  return isVitestViImport(variable);
};

const buildDiagnosticMessage = function buildDiagnosticMessage(methodName) {
  return `vi.${methodName}() is banned. Use hand-written stubs or constructor/parameter dependency injection instead. Never mock anything.`;
};

const noVitestMocksRule = {
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();

    return {
      CallExpression(node) {
        const memberExpression = getCalledMemberExpression(node);
        if (
          !memberExpression ||
          memberExpression.object.type !== "Identifier"
        ) {
          return;
        }

        const methodName = getMemberPropertyName(memberExpression);
        if (!methodName || !BANNED_VITEST_METHODS.has(methodName)) {
          return;
        }

        const bindingName = memberExpression.object.name;
        if (
          bindingName &&
          isVitestViReference(sourceCode, memberExpression.object)
        ) {
          context.report({
            message: buildDiagnosticMessage(methodName),
            node,
          });
        }
      },
    };
  },
  meta: {
    schema: [],
  },
};

const ringiTestingPolicyPlugin = {
  meta: {
    name: "ringi",
  },
  rules: {
    "no-vitest-mocks": noVitestMocksRule,
  },
};

export default ringiTestingPolicyPlugin;
