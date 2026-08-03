/**
 * Scoped to the Estimate Builder deliberately, not dropped into a global
 * components/ui/ folder — there was no existing label abstraction
 * anywhere in the project to extend (verified by search), and no other
 * form in the app currently has a comparable required-field pattern to
 * justify making this global preemptively. If a second, real reuse case
 * shows up later, promoting this one component is a trivial move — but
 * that's a decision for when it's actually needed, not now.
 *
 * Reproduces the two label styles already used in EstimateForm.tsx
 * exactly (`size="base"` = Customer/Property's own style, `size="sm"` =
 * the line-item fields' smaller style) — this only adds the required
 * marker, it doesn't change either existing look.
 */
export function RequiredLabel({ children, size = 'base' }: { children: React.ReactNode; size?: 'base' | 'sm' }) {
  return (
    <label className={size === 'sm' ? 'text-xs font-medium text-slate-500' : 'text-sm font-medium text-slate-700'}>
      {children} <span className="text-red-500" aria-hidden="true">*</span>
    </label>
  );
}
