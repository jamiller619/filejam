# Shared resource state component

## Context

Several desktop renderer views repeat the same asynchronous resource-state
sequence:

1. Show an error when the initial request fails.
2. Show a loading message while the request is pending.
3. Show a missing or empty message when no resource exists.
4. Render the view once the resource is available.

The clearest examples are `pages/Collection.tsx` and `pages/Library.tsx`.
Related inline states also appear in `pages/Settings.tsx`, `pages/Home.tsx`,
`components/files/Files.tsx`, and `components/layout/Navbar.tsx`.

## Proposed direction

Introduce two desktop-renderer components with separate responsibilities:

- `ResourceState<T>` controls rendering for a single asynchronous resource.
- `StatusMessage` provides consistent presentation and accessibility semantics
  for loading, error, missing, and other inline status messages.

Keep these components in the desktop renderer initially. `ResourceState`
represents application-specific query behavior, and the status presentation has
not yet demonstrated a need to be shared by other packages. They can move into
`packages/ui` later if genuine cross-package reuse emerges.

## `ResourceState<T>` API sketch

```tsx
type ResourceStateProps<T> = {
  value: T | null | undefined
  loading: boolean
  failed: boolean
  loadingMessage: string
  errorMessage: string
  missingMessage: string
  children: (value: T) => React.ReactNode
}

function ResourceState<T>({
  value,
  loading,
  failed,
  loadingMessage,
  errorMessage,
  missingMessage,
  children,
}: ResourceStateProps<T>) {
  if (failed) {
    return <StatusMessage tone="error">{errorMessage}</StatusMessage>
  }

  if (loading) {
    return <StatusMessage>{loadingMessage}</StatusMessage>
  }

  if (value == null) {
    return <StatusMessage>{missingMessage}</StatusMessage>
  }

  return children(value)
}
```

The child should be a render callback instead of an ordinary `ReactNode`. This
lets TypeScript narrow `value` to `T` inside the successful branch without a
non-null assertion.

Example usage:

```tsx
<ResourceState
  value={collection}
  loading={loading}
  failed={loadFailed}
  loadingMessage="Loading collection…"
  errorMessage="Unable to load collection."
  missingMessage="Collection not found."
>
  {(collection) => (
    <Page title={collection.name}>
      <Files collectionId={collection.id} />
    </Page>
  )}
</ResourceState>
```

## Scope

Good initial candidates:

- `pages/Collection.tsx`: replace the loading, failure, and missing early
  returns.
- `pages/Library.tsx`: replace the loading, failure, and missing early returns.
  Keep the invalid-library check separate because it validates route input
  rather than representing an asynchronous request state.

Do not force every status through `ResourceState`. Settings sections, the home
page, file listings, and navbar messages often need to preserve surrounding UI.
Those call sites can use `StatusMessage` directly while keeping their existing
conditional layout.

## Accessibility

- Loading and missing/empty messages should generally use `role="status"`,
  which announces updates politely.
- Request failures should generally use `role="alert"` when they appear after
  user-visible work begins and need immediate announcement.
- Do not hard-code one ARIA role for every state.
- Standardize punctuation and use the ellipsis character consistently instead
  of mixing `...` and `…`.

The exact semantics for initial page-load failures should be confirmed during
implementation. An assertive alert may be unnecessary if the message is already
present when the page first renders.

## Implementation decisions to revisit

- Whether `StatusMessage` needs visual variants such as `default`, `error`, and
  `empty`.
- Whether messages should accept `ReactNode` instead of `string` for richer
  content or retry controls.
- Whether retry behavior belongs in `ResourceState` or remains in each caller.
- Whether list contexts such as the navbar need polymorphic output (`p`, `li`,
  or `div`) or should retain context-specific markup.
- Whether a brief loading-delay policy is needed to prevent flashes for quickly
  resolved queries.

## Out of scope

- Changing `useApiQuery` or its `loading` and `loadFailed` contract.
- Combining validation errors, mutation errors, and asynchronous resource
  states into one abstraction.
- Moving the component into the shared UI package before it has a demonstrated
  cross-package use case.
