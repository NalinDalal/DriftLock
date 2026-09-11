# Changelog Detection

**Status:** Out of scope for v1. Noted for future consideration.

## The problem

Most early-stage API vendors don't publish structured changelogs. Changes show up in blog posts, tweets, Slack messages, or not at all. Even vendors with formal changelogs often have them drift from reality.

## Why it's separate from spec diffing

Spec diffing (Driftlock's v1 approach) only detects changes to endpoints the customer already calls. It structurally cannot surface new features or endpoints the customer isn't using yet. That requires a different sensor: crawling docs, changelogs, release notes, and social media.

## If we build it later

- Scrape vendor docs, GitHub releases, Twitter for API-related announcements.
- Use an LLM to extract "what changed" from unstructured text.
- Map announced changes to customer call sites to determine impact.
- This is a natural expansion after the core drift-detection loop is proven.
