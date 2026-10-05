# ADR-007: scoped readiness and claim freshness

Status: accepted, 2026-10-05.

The previous readiness policy required a useful local trial for every adoption and aged all
source claims after 90 days. That made a pinned documented convention behave like a proposed
runtime benefit. It also allowed an outcome for another consumer task to satisfy adoption.

New assessments use `adoption-readiness-v2`. A documented practice can be recommended when its
selected claims are supported, its documented interface is compatible, authority is safe and
action-specific unknowns are resolved. A failed observed check still rejects it. This advice
does not establish execution benefit, comparative superiority or human usefulness.

Runtime use and copying require a passed bounded check and useful feedback for the exact
workspace, bundle, candidate, consumer task and action before adoption. Copying also requires
declared redistribution rights. Production and comparative superiority remain deferred under
this lightweight policy. Historical feedback without action scope remains readable; it cannot
establish a v2 runtime trial. No result grants execution or publication authority.

An actor reviews each selected claim as stable, volatile with a bounded review interval, or
unknown. The shared freshness function uses that claim's source observation dates; review and
export dates never renew the observations. Missing or future observations are unknown. Stable
historical/specification claims do not become current deployment promises. These review choices
are actor declarations, not calibrated probabilities. Assessments save their time, review inputs
and per-claim results, and remain immutable.

Keep the v1 evaluator and stored results for historical semantics. A forward migration adds the
new policy identity and optional feedback scope without rewriting retained records. The alternative
of relabeling every old review or requiring trials for documentation was rejected because it
would respectively rewrite history or impose an unrelated burden.

Validation covers old-policy continuity, missing reviews, stable old observations, due volatile
claims, exact feedback bindings, legacy unscoped feedback, failure overrides and immutable writes.
Any stronger production/comparison policy needs its own observed inputs and version.
