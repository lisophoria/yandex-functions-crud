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

export async function handler(event: any) {
  if (event.httpMethod !== 'GET') return {
    statusCode: 405,
    body: { message: 'Method not allowed'},
  };

  try {
    const driver = await initDb();
    let orders: Order[] = [];
  
    await driver.tableClient.withSession(async (session) => {
      await session.streamReadTable('orders', (result) => {
        if (result.resultSet) {
          orders = Order.createNativeObjects(result.resultSet) as Order[];
        }
      });
    });
  
    driver.destroy();
    return orders;
  } catch (e: any) {
    return {
      statusCode: 500,
      body: {
        error: e.message,
      },
    };
  }
}
