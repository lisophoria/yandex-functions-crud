import { declareType, Driver, getLogger, getSACredentialsFromJson, IamAuthService, IAuthService, MetadataAuthService, TypedData, TypedValues, Types } from 'ydb-sdk';

const logger = getLogger();

const TIMEOUT = 10000; 

interface IOrder {
  id?: number;
  name: string;
  createdAt: Date;
}

class Order extends TypedData {
  @declareType(Types.UINT64)
  id: number;

  @declareType(Types.UTF8)
  name: string;

  @declareType(Types.TIMESTAMP)
  createdAt: Date;

  constructor(data: IOrder) {
      super(data);
      this.id = data.id;
      this.name = data.name;
      this.createdAt = data.createdAt;
  }
}

async function initDb(): Promise<Driver> {
  logger.info('Driver initializing...');
  let authService: IAuthService;

  if (!process.env.ENDPOINT) {
    const dotenv = await import('dotenv');
    dotenv.config();

    const saKeyFile = process.env.SA_KEY_FILE;
    const saCredentials = getSACredentialsFromJson('./' + saKeyFile);

    authService = new IamAuthService(saCredentials);
  } else {
    authService = new MetadataAuthService();
  }
  
  const driver = new Driver({ endpoint: process.env.ENDPOINT, database: process.env.DATABASE, authService });

  if (!(await driver.ready(TIMEOUT))) {
    logger.fatal(`Driver has not become ready in ${TIMEOUT}ms!`);
    process.exit(1);
  }

  logger.info('Driver ready');
  return driver;
}

export async function handler(event: any, context: any) {
  if (event.httpMethod !== 'POST') return {
    code: 405,
    body: { message: 'Method not allowed'},
  }

  let order: Order;

  try {
    order = new Order(event.body as IOrder)
  } catch (e) {
    return {
      statusCode: 400,
      body: {
        error: e.message,
      },
    };
  }

  try {
    const driver = await initDb();

    await driver.tableClient.withSession(async (session) => {
        const query = `
            DECLARE $name as Utf8;
            DECLARE $created_at as Timestamp;

            INSERT INTO orders (name, created_at)
            VALUES ($name, $created_at)
        `;
        const preparedQuery = await session.prepareQuery(query);
        await session.executeQuery(preparedQuery, {
            $name: TypedValues.utf8(order.name),
            $created_at: TypedValues.timestamp(order.createdAt),
        });
    });

    driver.destroy();
    return {
        statusCode: 201,
        body: {
            message: "Created",
            order,
        },
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      body: {
        error: e.message,
      },
    };
  }
}
