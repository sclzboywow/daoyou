export function authError(
  message: string,
  status = 400,
  code = 'BAD_REQUEST',
) {
  return Response.json(
    {
      code,
      message,
    },
    { status },
  );
}
