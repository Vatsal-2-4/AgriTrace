"""Reproduce and compare the mandi next-reported-price model."""

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from scipy import sparse
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "api" / "models" / "mandi"
RAW_DATA_URL = "https://raw.githubusercontent.com/BatMan0100/agricast/main/agmarknet_india_historical_prices_2024_2025.csv"
SERIES = ["state", "district_name", "market_name", "commodity", "variety", "grade"]
CATEGORICAL = SERIES
LAGS = [1, 2, 3, 7, 14, 30]
MEAN_WINDOWS = [3, 7, 14, 30]
STD_WINDOWS = [7, 14, 30]
NUMERIC = [
    "month", "day_of_week", "day_of_year",
    *[f"modal_lag_{lag}" for lag in LAGS],
    *[f"modal_mean_{window}" for window in MEAN_WINDOWS],
    *[f"modal_std_{window}" for window in STD_WINDOWS],
    "delta_1", "delta_3", "delta_7", "delta_14", "pct_change_1", "pct_change_7",
    "distance_from_mean_7", "distance_from_mean_30", "relative_to_mean_7", "relative_to_mean_30",
    "cv_7", "cv_14", "cv_30", "days_since_previous_report", "min_price", "max_price", "price_spread"
]


def build_features(raw):
    raw = raw.rename(columns={
        "Sl no.": "sl_no", "District Name": "district_name", "Market Name": "market_name",
        "State": "state", "Commodity": "commodity", "Variety": "variety", "Grade": "grade",
        "Min Price (Rs./Quintal)": "min_price", "Max Price (Rs./Quintal)": "max_price",
        "Modal Price (Rs./Quintal)": "modal_price", "Price Date": "price_date"
    })
    required = SERIES + ["min_price", "max_price", "modal_price", "price_date"]
    missing = sorted(set(required) - set(raw.columns))
    if missing:
        raise ValueError("Missing required CSV columns: " + ", ".join(missing))
    frame = raw[required].copy()
    frame["price_date"] = pd.to_datetime(frame["price_date"], errors="coerce")
    for column in ["min_price", "max_price", "modal_price"]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna(subset=required)
    frame = frame[(frame["min_price"] >= 0) & (frame["max_price"] >= frame["min_price"]) & (frame["modal_price"] > 0)]
    frame = frame.sort_values(SERIES + ["price_date"], kind="stable").reset_index(drop=True)

    group = frame.groupby(SERIES, sort=False, observed=True)
    modal = group["modal_price"]
    for lag in LAGS:
        frame[f"modal_lag_{lag}"] = modal.shift(lag)
    previous = modal.shift(1)
    previous_group = previous.groupby([frame[column] for column in SERIES], sort=False, observed=True)
    for window in MEAN_WINDOWS:
        frame[f"modal_mean_{window}"] = previous_group.rolling(window, min_periods=window).mean().reset_index(level=list(range(len(SERIES))), drop=True)
    for window in STD_WINDOWS:
        frame[f"modal_std_{window}"] = previous_group.rolling(window, min_periods=window).std().reset_index(level=list(range(len(SERIES))), drop=True)

    for lag in [1, 3, 7, 14]:
        frame[f"delta_{lag}"] = frame["modal_price"] - frame[f"modal_lag_{lag}"]
    frame["pct_change_1"] = (frame["modal_price"] / frame["modal_lag_1"] - 1).replace([np.inf, -np.inf], np.nan)
    frame["pct_change_7"] = (frame["modal_price"] / frame["modal_lag_7"] - 1).replace([np.inf, -np.inf], np.nan)
    for window in [7, 30]:
        mean = frame[f"modal_mean_{window}"]
        frame[f"distance_from_mean_{window}"] = frame["modal_price"] - mean
        frame[f"relative_to_mean_{window}"] = (frame["modal_price"] / mean - 1).replace([np.inf, -np.inf], np.nan)
    for window in STD_WINDOWS:
        frame[f"cv_{window}"] = (frame[f"modal_std_{window}"] / frame[f"modal_mean_{window}"]).replace([np.inf, -np.inf], np.nan)
    frame["days_since_previous_report"] = (frame["price_date"] - group["price_date"].shift(1)).dt.days
    frame["price_spread"] = frame["max_price"] - frame["min_price"]
    frame["month"] = frame["price_date"].dt.month
    frame["day_of_week"] = frame["price_date"].dt.dayofweek
    frame["day_of_year"] = frame["price_date"].dt.dayofyear

    frame["next_modal_price"] = group["modal_price"].shift(-1)
    frame["next_price_date"] = group["price_date"].shift(-1)
    frame["target_delta"] = frame["next_modal_price"] - frame["modal_price"]
    return frame.dropna(subset=NUMERIC + ["target_delta", "next_modal_price", "next_price_date"])


def matrix(frame, encoder):
    categories = encoder.transform(frame[CATEGORICAL].fillna("Unknown").astype(str))
    numeric = sparse.csr_matrix(frame[NUMERIC].to_numpy(dtype=np.float32))
    return sparse.hstack([numeric, categories], format="csr")


def score(y_true, predicted, current):
    next_price = current + predicted
    actual_delta = y_true
    actual_next = current + y_true
    nonzero = actual_next != 0
    return {
        "delta_mae": round(float(mean_absolute_error(actual_delta, predicted)), 4),
        "price_mae": round(float(mean_absolute_error(actual_next, next_price)), 4),
        "price_rmse": round(float(np.sqrt(mean_squared_error(actual_next, next_price))), 4),
        "price_mape_percent": round(float(np.mean(np.abs((actual_next[nonzero] - next_price[nonzero]) / actual_next[nonzero])) * 100), 4),
        "directional_accuracy_percent": round(float(np.mean(np.sign(actual_delta) == np.sign(predicted)) * 100), 4),
        "r2_price": round(float(r2_score(actual_next, next_price)), 6),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", nargs="?", help="Local Agmarknet CSV; downloads the upstream file when omitted")
    parser.add_argument("--output", default=str(ROOT / "artifacts" / "mandi-training"), help="Output directory (ignored by Git by default only if under artifacts)")
    parser.add_argument("--max-trees", type=int, default=800)
    parser.add_argument("--early-stopping", type=int, default=40)
    args = parser.parse_args()

    raw = pd.read_csv(args.csv or RAW_DATA_URL, low_memory=False)
    data = build_features(raw)
    train_end = pd.Timestamp("2025-05-31")
    valid_end = pd.Timestamp("2025-07-31")
    train = data[data["next_price_date"] <= train_end]
    valid = data[(data["next_price_date"] > train_end) & (data["next_price_date"] <= valid_end)]
    test = data[data["next_price_date"] > valid_end]
    if min(len(train), len(valid), len(test)) == 0:
        raise ValueError("Expected non-empty chronological train, validation and test partitions")

    encoder = OneHotEncoder(handle_unknown="ignore", dtype=np.float32)
    encoder.fit(train[CATEGORICAL].fillna("Unknown").astype(str))
    x_train, x_valid, x_test = matrix(train, encoder), matrix(valid, encoder), matrix(test, encoder)
    params = dict(
        objective="reg:squarederror", eval_metric="mae", learning_rate=0.05,
        max_depth=8, min_child_weight=5, subsample=0.8, colsample_bytree=0.8,
        reg_lambda=5, tree_method="hist", n_estimators=args.max_trees,
        random_state=42, n_jobs=-1, early_stopping_rounds=args.early_stopping
    )
    model = xgb.XGBRegressor(**params)
    model.fit(x_train, train["target_delta"].to_numpy(), eval_set=[(x_valid, valid["target_delta"].to_numpy())], verbose=False)

    y_test = test["target_delta"].to_numpy()
    current_test = test["modal_price"].to_numpy()
    predictions = model.predict(x_test)
    baseline = np.zeros_like(y_test)
    payload = {
        "modelVersion": "khetsetu-mandi-xgb-v3-delta",
        "dataset": args.csv or RAW_DATA_URL,
        "rows": {"train": len(train), "validation": len(valid), "test": len(test)},
        "dateRanges": {name: {"start": part["price_date"].min().date().isoformat(), "end": part["price_date"].max().date().isoformat()} for name, part in (("train", train), ("validation", valid), ("test", test))},
        "target": "next reported modal price minus current modal price",
        "units": "INR/quintal",
        "bestIteration": int(model.best_iteration),
        "xgboostVersion": xgb.__version__,
        "baselineTest": score(y_test, baseline, current_test),
        "modelTest": score(y_test, predictions, current_test),
        "featureCount": len(NUMERIC) + sum(len(categories) for categories in encoder.categories_),
        "previousModelMetrics": json.loads((MODEL_DIR / "model_metrics.json").read_text(encoding="utf-8"))
    }
    if payload["modelTest"]["price_mae"] >= payload["baselineTest"]["price_mae"]:
        raise SystemExit("Candidate did not beat persistence price MAE; refusing to write replacement artifacts")

    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    model.get_booster().save_model(output / "khetsetu-mandi-xgb-v3-delta.json")
    joblib.dump({
        "encoder": encoder, "categorical_columns": CATEGORICAL, "numeric_features": NUMERIC,
        "series_columns": SERIES, "lags": LAGS, "rolling_mean_windows": MEAN_WINDOWS,
        "rolling_std_windows": STD_WINDOWS
    }, output / "preprocessing.joblib")
    (output / "metrics.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: payload[key] for key in ("modelVersion", "rows", "bestIteration", "baselineTest", "modelTest")}, indent=2))
    print(f"Candidate artifacts written to {output}; production artifacts were not changed.")


if __name__ == "__main__":
    main()
