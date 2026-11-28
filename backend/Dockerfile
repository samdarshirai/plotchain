FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
# Maven Central rate-limits shared CI IPs (HTTP 429), so retry with backoff.
RUN for i in 1 2 3 4 5; do mvn -B dependency:go-offline && exit 0; sleep $((i * 20)); done; exit 1
COPY src src
RUN for i in 1 2 3 4 5; do mvn -B package -DskipTests && exit 0; sleep $((i * 20)); done; exit 1

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
