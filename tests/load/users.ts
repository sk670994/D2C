function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }

  return value;
}

export type LoadTestUser = {
  id: number;
  email: string;
  password: string;
};

const password = required("LOAD_TEST_PASSWORD");

const rawUsers = required("LOAD_TEST_USERS");

export const USERS: LoadTestUser[] = rawUsers
  .split(",")
  .map((email, index) => ({
    id: index + 1,
    email: email.trim(),
    password,
  }))
  .filter((user) => user.email.length > 0);

if (USERS.length === 0) {
  throw new Error("LOAD_TEST_USERS contains no users.");
}
