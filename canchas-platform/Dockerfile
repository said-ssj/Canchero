# 1. Etapa de compilación utilizando Maven y JDK 21
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app

# Instalamos Maven directamente en el contenedor Alpine
RUN apk add --no-cache maven

# Copiamos todo el contenido del repositorio
COPY . .

# Compilamos apuntando al pom.xml de la API
RUN mvn -f apps/api/pom.xml clean package -DskipTests

# 2. Etapa de ejecución ligera con JRE 21
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Copiamos el archivo JAR generado
COPY --from=build /app/apps/api/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]