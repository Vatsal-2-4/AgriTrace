---
title: AgriTrace Produce Quality API
emoji: 🌱
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# AgriTrace produce quality service

Authenticated CPU inference for the AgriTrace marketplace. The container includes
the supplied tomato detector and ripeness classifier. It does not train models.

Set `QUALITY_SERVICE_TOKEN` as a Space secret before starting the service.
`GET /health` reports readiness. POST requests require
`Authorization: Bearer <QUALITY_SERVICE_TOKEN>` and a JSON body containing
`cropId` and `imageBase64`.

This is an API service, so the root page intentionally does not show an interface.
Crop photos are processed in memory and are not saved by this service. The main
marketplace separately controls photo storage and access. Visual grades are
provisional and require partner review. Potato and onion use manual review.
