import os

import click
import duckdb
import pandas as pd
from .conda.get_conda_package_names import get_conda_package_names
from .conda.scrape_conda import scrape_conda
from .data_retrieval.json_scraper import scrape_json
from .data_retrieval.web_scraper import scrape_web
from .github.github_scraper import scrape_github_data
from .logger import setup_logger
from .utils.get_pypi_package_list import get_pypi_package_names
from .vulnerabilities.scrape_vulnerabilities import scrape_vulnerabilities
from google.cloud import storage

OUTPUT_ROOT = os.environ.get("OUTPUT_ROOT", "./output")


def read_parquet_from_gcs(gcs_url):
    # Parse the GCS URL
    bucket_name, blob_name = gcs_url.replace("gs://", "").split("/", 1)

    # Initialize a GCS client
    client = storage.Client()

    # Get the bucket and blob
    bucket = client.get_bucket(bucket_name)
    blob = bucket.blob(blob_name)

    # Download the content of the blob as a string
    content = blob.download_as_bytes()

    # Read the parquet file from the bytes
    return pd.read_parquet(pd.io.common.BytesIO(content))


partition_option = click.option(
    "-p",
    "--partition",
    default=lambda: os.environ.get("SCORE_PARTITION"),
    required=True,
    type=int,
    help="The partition number to process.",
)

num_partitions_option = click.option(
    "-n",
    "--num-partitions",
    required=True,
    default=lambda: os.environ.get("SCORE_NUM_PARTITIONS"),
    type=int,
    help="The number of partitions in total.",
)


@click.group()
def cli():
    setup_logger()


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "pypi-json"),
    help="The output directory to save the scraped data in hive partition",
)
@partition_option
@num_partitions_option
def scrape_pypi(num_partitions, partition, output):
    packages = get_pypi_package_names(num_partitions, partition)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )

    df = scrape_json(packages)
    df["partition"] = partition

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "pypi-web"),
    help="The output directory to save the scraped data in hive partition",
)
@partition_option
@num_partitions_option
def scrape_pypi_web(num_partitions, partition, output):
    packages = get_pypi_package_names(num_partitions, partition)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )

    df = scrape_web(packages)
    df["partition"] = partition

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "-i",
    "--input",
    default=os.path.join(OUTPUT_ROOT, "source-urls.parquet"),
    help="The input file containing the GitHub URLs",
)
@click.option(
    "-o",
    "--output",
    default=os.path.join(OUTPUT_ROOT, "github-details"),
    help="The output directory to save the detailed GitHub data in hive partition",
)
@partition_option
@num_partitions_option
def scrape_github(input, output, num_partitions, partition):
    click.echo("Scraping GitHub data.")

    if input.startswith("gs://"):
        # Read from GCS
        df = read_parquet_from_gcs(input)
    else:
        # Read from local file
        df = pd.read_parquet(input)

    if df.empty:
        click.echo("No valid GitHub URLs found in the input file.")
        return

    total_rows = len(df)
    partition_size = total_rows // num_partitions
    start_index = partition * partition_size
    end_index = (
        total_rows if partition == num_partitions - 1 else start_index + partition_size
    )

    df_partition = df.iloc[start_index:end_index]
    click.echo(
        f"Processing {len(df_partition)} URLs in partition {partition + 1} of {num_partitions}"
    )

    result_df = scrape_github_data(df_partition)
    result_df["partition"] = partition

    click.echo(f"Saving data to {output} in partition {partition}")
    result_df.to_parquet(output, partition_cols=["partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "conda"),
    help="The output directory to save the scraped data in hive partition",
)
@click.option(
    "-c",
    "--channel",
    default="conda-forge",
    help="The conda channel to scrape packages from",
)
@partition_option
@num_partitions_option
def conda(num_partitions, partition, output, channel):
    packages = get_conda_package_names(num_partitions, partition, channel)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )
    df = scrape_conda(channel, packages)
    df["partition"] = partition
    df["channel"] = channel

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["channel", "partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "--output",
    default=os.path.join(OUTPUT_ROOT, "vulnerabilities"),
    help="The output directory to save the scraped data in hive partition",
)
@click.option(
    "-e",
    "--ecosystem",
    default="PyPI",
    help="The ecosystem to scrape vulnerabilities for",
)
@partition_option
@num_partitions_option
def vulnerabilities(num_partitions, partition, output, ecosystem):
    if ecosystem == "PyPI":
        packages = get_pypi_package_names(num_partitions, partition)
    click.echo(
        f"Will process {len(packages)} packages in partition {partition} of {num_partitions}"
    )

    df = scrape_vulnerabilities(ecosystem, packages)
    df["partition"] = partition
    df["ecosystem"] = ecosystem

    click.echo(f"Saving data to {output}")
    df.to_parquet(output, partition_cols=["ecosystem", "partition"])
    click.echo("Scraping completed.")


@cli.command()
@click.option(
    "-o",
    "--output",
    default=os.path.join(OUTPUT_ROOT, "source-urls.parquet"),
    help="The output path to save the aggregated data",
)
@click.option(
    "-i",
    "--input",
    default=OUTPUT_ROOT,
    help="The input directory to read the data from",
)
def agg_source_urls(input, output):
    click.echo("Aggregating data")

    db = duckdb.connect()
    # Public dataset / empty secret
    db.execute("CREATE SECRET (TYPE GCS);")

    df = db.query(
        f"""
        WITH pypi_sources AS (
        SELECT source_url FROM read_parquet('{input}/pypi-json/*/*.parquet')
        ),
        conda_sources AS (
        SELECT source_url FROM read_parquet('{input}/conda/*/*/*.parquet')
        )
        SELECT DISTINCT source_url
        FROM (
            SELECT source_url FROM pypi_sources
            UNION ALL
            SELECT source_url FROM conda_sources
        );
    """
    ).df()
    df.to_parquet(output)
    click.echo("Aggregation completed.")


if __name__ == "__main__":
    cli()
