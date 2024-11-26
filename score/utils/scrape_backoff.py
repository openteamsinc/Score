from datetime import datetime
import math


def scrape_backoff(
    last_update: datetime, last_scrape: datetime, today: datetime
) -> bool:

    t_today = (today - last_update).days
    t_scrape = (last_scrape - last_update).days

    days_since_scrape = (today - last_scrape).days

    # # Base interval doubles every 30 days since release
    base_interval = 1.0
    multiplier = math.pow(2, t_today / 30)
    required_interval = int(math.floor(min(base_interval * multiplier, 30)))
    if required_interval == 1:
        print("Should scrape every day")
        return True
    print("t_today", t_today)
    print("t_scrape", t_scrape)
    print("required_interval", required_interval)
    print("days_since_scrape", days_since_scrape)

    # Return True only when we've waited the required interval
    if days_since_scrape >= required_interval:
        return True

    next_scrape = (t_today // required_interval) * required_interval
    print("next_scrape", next_scrape)

    return t_scrape <= next_scrape
