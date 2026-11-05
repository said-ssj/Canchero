# Compatibility only: Render root directory canchas-platform.
# Prefer apps/api/Dockerfile with root directory canchas-platform/apps/api.
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app
COPY apps/api/.mvn/ .mvn
COPY apps/api/mvnw apps/api/pom.xml ./
RUN sed -i 's/\r$//' mvnw && chmod +x mvnw
COPY apps/api/src ./src
RUN --mount=type=cache,target=/root/.m2 ./mvnw clean package -B -DskipTests

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
USER 10001:10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
