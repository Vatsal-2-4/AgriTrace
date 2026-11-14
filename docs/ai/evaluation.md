# Current AI evaluation and limits

## Mandi price model already in the repository

The packaged `khetsetu-mandi-xgb-v2-delta` model predicts the change to the next reported modal price from one mandi/commodity series. Its recorded holdout covers 2025-08-01 through 2025-08-13, with MAE 208.82 INR/quintal and MAPE 5.53%. Directional accuracy is 39.11%; MAE is only 0.13% better than the persistence baseline and MAPE only 0.23% better. The high stored R² should not be presented alone as evidence of useful direction prediction.

The returned prediction is the next reported observation, not necessarily tomorrow. This model does not forecast regional buyer demand and does not use image quality, transport or storage costs.

## New demand and price estimates

The current `api/ai/intelligence.js` demand and price outputs are transparent heuristic baselines, not trained ML models. They are labelled with `method: "HEURISTIC"`/heuristic model versions. Demand uses the supplied dated quantities; price uses supplied dated prices and optional supplied quality/demand/cost inputs. Both return explicit insufficient-data states. Confidence is a capped sample-size indicator, not a calibrated probability; the UI must describe it accordingly or avoid showing it as model confidence.

## Image grading

No image grader is included yet. The repository does not currently provide a labelled produce-image dataset, selected target crop, model weights or a repeatable validation split. Do not return an AI grade until those are selected and measured; unsupported inputs must require human review.
