const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.DYNAMODB_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function getItem(tableName, key) {
  const result = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return result.Item || null;
}

async function putItem(tableName, item) {
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
}

async function updateItem(tableName, key, updateExpression, expressionAttributeValues, expressionAttributeNames = {}) {
  const params = {
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
  };
  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }
  await docClient.send(new UpdateCommand(params));
}

async function queryItems(tableName, keyConditionExpression, expressionAttributeValues, options = {}) {
  const params = {
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ...options,
  };
  const result = await docClient.send(new QueryCommand(params));
  return result.Items || [];
}

async function scanItems(tableName, filterExpression = null, expressionAttributeValues = null) {
  const params = { TableName: tableName };
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = expressionAttributeValues;
  }
  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function batchGet(tableName, keys) {
  if (!keys.length) return [];
  // DynamoDB BatchGet limit is 100 items
  const chunks = [];
  for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));

  const results = [];
  for (const chunk of chunks) {
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: { [tableName]: { Keys: chunk } },
    }));
    results.push(...(result.Responses?.[tableName] || []));
  }
  return results;
}

async function batchWrite(tableName, items) {
  if (!items.length) return;
  // DynamoDB BatchWrite limit is 25 items
  const chunks = [];
  for (let i = 0; i < items.length; i += 25) chunks.push(items.slice(i, i + 25));

  for (const chunk of chunks) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((item) => ({ PutRequest: { Item: item } })),
      },
    }));
  }
}

module.exports = { getItem, putItem, updateItem, queryItems, scanItems, batchGet, batchWrite };
