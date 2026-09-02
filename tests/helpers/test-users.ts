/**
 * Stali, deterministyczni użytkownicy testowi używani przez `tests/setup/global-setup.ts`
 * (tworzenie kont) i przez helpery logowania w testach. Wartości muszą pozostać stałe
 * między uruchomieniami — testy dzielą te same konta zamiast tworzyć nowe za każdym razem.
 */

export const TEST_USER_A = {
  email: "test-user-a@10x-cards.test",
  password: "Test-User-A-Password-123!",
};

export const TEST_USER_B = {
  email: "test-user-b@10x-cards.test",
  password: "Test-User-B-Password-123!",
};
