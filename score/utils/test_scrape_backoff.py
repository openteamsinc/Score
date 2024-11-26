import pytest
from datetime import datetime, timedelta
import math
from .scrape_backoff import scrape_backoff


@pytest.mark.parametrize(
    "name,last_update,last_scrape,today,expected",
    [
        (
            "New package scraped yesterday",
            "2023-12-27",  # 5 days old
            "2023-12-31",
            "2024-01-01",
            True,
        ),
        (
            "Medium age package scraped yesterday",
            "2023-11-02",  # 60 days old
            "2023-12-30",
            "2024-01-01",
            True,
        ),
        (
            "Medium age package scraped yesterday",
            "2023-11-03",  # 60 days old
            "2023-12-31",
            "2024-01-01",
            False,
        ),
        (
            "Old package scraped 17 days ago",
            "2022-11-27",  # 400 days old
            "2023-12-15",
            "2024-01-01",
            True,
        ),
        (
            "Old package scraped 7 days ago",
            "2022-11-27",  # 400 days old
            "2023-12-25",
            "2024-01-01",
            False,
        ),
        (
            "Package updated after last scrape",
            "2024-01-01",
            "2023-12-31",  # Scrape before update
            "2024-01-02",
            True,
        ),
        (
            "Multiple required intervals since last scrape",
            "2023-01-01",  # ~365 days old
            "2023-11-01",  # 61 days ago
            "2024-01-01",
            True,
        ),
    ],
)
def test_should_scrape(
    name: str, last_update: str, last_scrape: str, today: str, expected: bool
):
    last_update_dt = datetime.strptime(last_update, "%Y-%m-%d")
    last_scrape_dt = datetime.strptime(last_scrape, "%Y-%m-%d")
    today_dt = datetime.strptime(today, "%Y-%m-%d")

    result = scrape_backoff(last_update_dt, last_scrape_dt, today_dt)

    t_today = (today_dt - last_update_dt).days
    t_scrape = (last_scrape_dt - last_update_dt).days
    days_since_scrape = (today_dt - last_scrape_dt).days
    multiplier = math.pow(2, t_today / 30)
    required_interval = int(math.floor(min(1.0 * multiplier, 30)))
    next_scrape = (t_today // required_interval) * required_interval

    print(f"\nTest: {name}")
    print(f"Package age: {t_today} days")
    print(f"Last scrape: {t_scrape} days after update")
    print(f"Days since last scrape: {days_since_scrape}")
    print(f"Required interval: {required_interval}")
    print(f"Next scrape window: {next_scrape}")

    assert result == expected


def test_interval_growth():
    """Test how the required interval grows with package age"""
    base_date = datetime(2024, 1, 1)
    ages = [0, 7, 30, 60, 90, 180, 365]

    print("\nInterval growth test:")
    for age in ages:
        last_update = base_date - timedelta(days=age)
        t_today = (base_date - last_update).days
        multiplier = math.pow(2, t_today / 30)
        required_interval = int(math.floor(min(1.0 * multiplier, 30)))
        print(f"Age {age} days -> {required_interval} day interval")


def test_window_boundaries():
    """Test scraping windows for a package with 4-day interval"""
    base = datetime(2024, 1, 1)
    update = base - timedelta(days=60)  # Should give ~4 day interval
    scrape = update  # Last scraped at update time

    print("\nWindow boundaries test (4-day interval):")
    for day in range(10):
        today = base + timedelta(days=day)
        should = scrape_backoff(update, scrape, today)
        t_today = (today - update).days
        multiplier = math.pow(2, t_today / 30)
        required_interval = int(math.floor(min(1.0 * multiplier, 30)))
        next_scrape = (t_today // required_interval) * required_interval
        print(f"Day {day}: Window {next_scrape}, Should scrape? {should}")
