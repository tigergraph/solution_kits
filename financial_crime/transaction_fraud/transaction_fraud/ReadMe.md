### Instructions

The `setup.sh` script is designed to streamline the initial setup process by sequentially executing the following steps:

1. **Schema Creation**: Initiates the schema creation process using the `1_create_schema.gsql` script. This schema is a subset of the Super Schema in financial_crime/library.
2. **Data Loading**: Load data into the schema by running the data loading job with the `2_load_data.gsql` script. 
3. **Query Installation**: Completes the setup by installing necessary queries through the `3_install_queries.sh` script.

### Query 

To initiate the `wcc` and `pagerank` algorithms on the Merchant and Card network, it's essential to first execute the following two queries:

- `merchant_merchant_with_weights`
- `card_card_with_weights`

The provided solution kit includes two variations of the `wcc` community algorithm. The first employs the default community algorithm found in the built-in algorithm library, while the second leverages edge weight-based `wcc` to enhance community detection according to the dataset. Users have the flexibility to select either option for clustering purposes. Subsequent queries can be run following the completion of the aforementioned two.

### Mock Data

The `data` folder is populated with sample data files. These files are crafted to closely mimic real-world scenarios, providing a realistic context for testing and demonstration purposes.

