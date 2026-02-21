// src/adapter/aws-lambda/conninfo.ts
var getConnInfo = (c) => {
  const requestContext = c.env.requestContext;
  let address;
  if ("identity" in requestContext && requestContext.identity?.sourceIp) {
    address = requestContext.identity.sourceIp;
  } else if ("http" in requestContext && requestContext.http?.sourceIp) {
    address = requestContext.http.sourceIp;
  } else {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      address = xff.split(",")[0].trim();
    }
  }
  return {
    remote: {
      address
    }
  };
};
export {
  getConnInfo
};
