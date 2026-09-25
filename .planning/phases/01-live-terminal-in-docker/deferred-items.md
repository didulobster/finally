## Deferred Items

- Header overflows horizontally at phone width (390 px)
  status: open
  **What:** `frontend/components/Header.tsx` is one non-wrapping flex row, so at 390 px the LIVE label sits past the viewport edge and the page scrolls sideways (full-page screenshot is 452 px wide). Tablet width (768 px) and up fit. Found in 01-03; plan 01-03 said to compose Header, not change it. A `flex-wrap` on the header row would fix it.
