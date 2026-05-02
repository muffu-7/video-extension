# Review Code Against Plan

Reviews code changes against a plan document when provided, or reviews the full diff on its own when no plan is available. Read-only - never modifies code.

## Process

1. **Find the plan document if one exists**
   - Check for attached files (e.g., `@PLAN.md`)
   - Look for recently viewed .md files with "PLAN" in name
   - If no plan is provided or discoverable, continue without one

2. **If a plan exists, read it** to understand requirements and constraints

3. **Get unstaged changes**: `git diff`

4. **Read modified files** for full context

5. **Review against criteria**:
   - **Correctness**: Logic handles all cases, proper error handling
   - **Code quality**: Follows existing patterns, no duplication
   - **Best practices**: Validation, security, performance
   - **Implementation**: Correct imports, APIs maintained, efficient queries
   - **Plan adherence**: If a plan is provided, verify the implementation covers planned scope and flag missing, incorrect, or unnecessary plan-related work
   - **Out-of-scope changes**: Even if a plan is provided, review all diff hunks, including code outside the plan's scope, for correctness, quality, regressions, and other risks

## Report Format

```markdown
# Code Review: [Title]

## Changes Overview
- Files: [list]
- Status: ✅ Compliant | ⚠️ Partial | ❌ Non-Compliant

## ✅ What's Working Well
[Correct implementations]

## 🔴 Critical Issues (Must Fix)
**[Title]**
- File: `path:line`
- Problem: [What's wrong]
- Expected: [Requirement or correct behavior]
- Actual: [Current behavior]
- Fix: [Specific solution with code]

## 🟡 Suggestions (Should Consider)
**[Title]**
- File: `path:line`
- Observation: [Issue]
- Fix: [How to improve]

## 🟢 Minor Enhancements (Optional)
[Nice-to-haves]

## Summary
Critical: [count] | Suggestions: [count] | Minor: [count]
Recommendation: [Ready/Needs fixes]
```

## Review Principles

- Be specific: Cite line numbers and, when a plan exists, relevant plan sections
- Be actionable: Include code examples for fixes
- Prioritize: 🔴 Bugs/regressions → 🟡 Quality/performance → 🟢 Nice-to-haves
- Stay focused: Review all unstaged changes, using the plan as additional context when available

## Constraints

- **Never** make code changes, stage, commit, or modify files
- **Only** review unstaged changes (`git diff`)
- **Always** cite specific lines
- **Quote plan sections only when a plan is provided**
