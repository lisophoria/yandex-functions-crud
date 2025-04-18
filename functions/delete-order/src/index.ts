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
  if (event.httpMethod !== 'DELETE') return {
    statusCode: 405,
    body: { message: 'Method not allowed'},
  };

  const id = parseInt(event.queryStringParameters?.id);

  if (!id) return {
    code: 400,
    body: { error: 'Bad request' },
  };

  try {
    const driver = await initDb();

    await driver.tableClient.withSession(async (session) => {
      const query = `
        DECLARE $id AS Uint64;

        DELETE FROM orders
        WHERE id = $id;
      `;

      const prepared = await session.prepareQuery(query);

      const result = await session.executeQuery(prepared, {
        $id: TypedValues.uint64(id),
      });
    });

    driver.destroy();
    return {
      statusCode: 200,
      body: { message: 'OK' },
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