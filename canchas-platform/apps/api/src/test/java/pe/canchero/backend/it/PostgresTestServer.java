package pe.canchero.backend.it;

import org.junit.jupiter.api.Assumptions;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import javax.sql.DataSource;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Arranca un cluster PostgreSQL efimero con los binarios locales.
 * Si no hay PostgreSQL disponible, las pruebas se omiten (no fallan) para
 * mantener el build funcional en equipos sin el motor instalado.
 */
public final class PostgresTestServer {

    private static final Object LOCK = new Object();
    private static final String DATABASE = "canchero_it";
    private static final Path BASE_DIR = Path.of(System.getProperty("user.dir"))
            .resolve("target")
            .resolve("postgres-it-" + ProcessHandle.current().pid());

    private static boolean started;
    private static boolean available;
    private static String unavailableReason = "PostgreSQL no disponible";
    private static Path dataDir;
    private static Path logFile;
    private static Path processOutput;
    private static int port;
    private static DriverManagerDataSource dataSource;
    private static String pgCtl;

    private PostgresTestServer() {}

    public static void requireAvailable() {
        if (!ensureStarted()) {
            Assumptions.assumeTrue(false, unavailableReason);
        }
    }

    public static DataSource dataSource() {
        if (!ensureStarted()) {
            throw new IllegalStateException(unavailableReason);
        }
        return dataSource;
    }

    public static void resetSchema() {
        if (!ensureStarted()) {
            throw new IllegalStateException(unavailableReason);
        }
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("drop schema public cascade");
            statement.execute("create schema public");
            String schema;
            try (var in = PostgresTestServer.class.getResourceAsStream("/postgres/schema.sql")) {
                if (in == null) {
                    throw new IllegalStateException("No se encontro /postgres/schema.sql en el classpath");
                }
                schema = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
            statement.execute(schema);
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo reiniciar el esquema PostgreSQL de pruebas", ex);
        }
    }

    private static boolean ensureStarted() {
        synchronized (LOCK) {
            if (started) {
                return available;
            }
            started = true;
            try {
                start();
                available = true;
            } catch (Exception ex) {
                available = false;
                unavailableReason = "PostgreSQL no disponible para pruebas de integracion: " + ex.getMessage();
                stop();
            }
            return available;
        }
    }

    private static void start() throws Exception {
        String bin = locateBinDir();
        String initdb = findExecutable(bin, "initdb");
        pgCtl = findExecutable(bin, "pg_ctl");

        deleteRecursively(BASE_DIR);
        Files.createDirectories(BASE_DIR);
        dataDir = BASE_DIR.resolve("data");
        logFile = BASE_DIR.resolve("postgres.log");
        processOutput = BASE_DIR.resolve("process-output.log");

        run(List.of(initdb, "-D", dataDir.toString(), "-U", "postgres", "-A", "trust",
                "-E", "UTF8", "--no-locale"), 90);
        port = freePort();
        run(List.of(pgCtl, "-D", dataDir.toString(), "-l", logFile.toString(),
                "-o", "-p " + port + " -h 127.0.0.1", "-w", "start"), 90);

        String baseUrl = "jdbc:postgresql://127.0.0.1:" + port + "/";
        waitForServer(baseUrl + "postgres");
        try (Connection connection = DriverManager.getConnection(baseUrl + "postgres", "postgres", "");
             Statement statement = connection.createStatement()) {
            statement.execute("create database " + DATABASE);
        }
        dataSource = new DriverManagerDataSource(baseUrl + DATABASE, "postgres", "");
        Runtime.getRuntime().addShutdownHook(new Thread(PostgresTestServer::stop, "canchero-postgres-shutdown"));
    }

    private static String locateBinDir() {
        String configured = System.getenv("TEST_POSTGRES_BIN");
        if (configured != null && !configured.isBlank()) {
            Path path = Path.of(configured);
            if (Files.isDirectory(path)) {
                return path.toString();
            }
        }
        Path programFiles = Path.of("C:/Program Files/PostgreSQL");
        if (Files.isDirectory(programFiles)) {
            try (var versions = Files.list(programFiles)) {
                List<Path> candidates = versions
                        .filter(Files::isDirectory)
                        .sorted(Comparator.comparing(Path::getFileName).reversed())
                        .toList();
                for (Path candidate : candidates) {
                    Path initdb = findExecutablePath(candidate.resolve("bin").toString(), "initdb");
                    if (initdb != null) {
                        return candidate.resolve("bin").toString();
                    }
                }
            } catch (IOException ignored) {
                // Se intenta con PATH.
            }
        }
        return "";
    }

    private static String findExecutable(String binDir, String name) {
        Path found = findExecutablePath(binDir, name);
        if (found == null) {
            throw new IllegalStateException("No se encontro " + name + " en PostgreSQL. " +
                    "Instala PostgreSQL o define TEST_POSTGRES_BIN con la carpeta bin.");
        }
        return found.toString();
    }

    private static Path findExecutablePath(String binDir, String name) {
        List<String> names = isWindows() ? List.of(name + ".exe", name) : List.of(name);
        if (binDir != null && !binDir.isBlank()) {
            for (String candidate : names) {
                Path path = Path.of(binDir, candidate);
                if (Files.isRegularFile(path)) {
                    return path;
                }
            }
        }
        String pathEnv = System.getenv("PATH");
        if (pathEnv != null) {
            for (String entry : pathEnv.split(java.io.File.pathSeparator)) {
                for (String candidate : names) {
                    Path path = Path.of(entry, candidate);
                    if (Files.isRegularFile(path)) {
                        return path;
                    }
                }
            }
        }
        return null;
    }

    private static void waitForServer(String url) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 60; attempt++) {
            try (Connection ignored = DriverManager.getConnection(url, "postgres", "")) {
                return;
            } catch (Exception ex) {
                last = ex;
                Thread.sleep(250);
            }
        }
        throw new IllegalStateException("PostgreSQL no respondio en el puerto " + port, last);
    }

    private static int freePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        }
    }

    private static void run(List<String> command, int timeoutSeconds) throws Exception {
        if (processOutput == null) {
            processOutput = BASE_DIR.resolve("process-output.log");
        }
        Files.createDirectories(BASE_DIR);
        Process process = new ProcessBuilder(command)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.appendTo(processOutput.toFile()))
                .start();
        boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
        if (!finished) {
            process.destroyForcibly();
            process.waitFor(5, TimeUnit.SECONDS);
            throw new IllegalStateException("Tiempo agotado ejecutando " + command.get(0)
                    + ": " + readProcessOutput(command.get(0)));
        }
        if (process.exitValue() != 0) {
            String log = readLogTail();
            throw new IllegalStateException(command.get(0) + " fallo (" + process.exitValue() + "): "
                    + readProcessOutput(command.get(0)) + (log.isBlank() ? "" : "\n" + log));
        }
    }

    private static String readProcessOutput(String executable) {
        try {
            if (processOutput != null && Files.exists(processOutput)) {
                String text = Files.readString(processOutput, StandardCharsets.UTF_8);
                return text.length() > 6000 ? text.substring(text.length() - 6000) : text;
            }
        } catch (IOException ignored) {
            // sin salida disponible
        }
        return "sin salida de " + executable;
    }

    private static String readLogTail() {
        try {
            if (logFile != null && Files.exists(logFile)) {
                String text = Files.readString(logFile, StandardCharsets.UTF_8);
                return text.length() > 4000 ? text.substring(text.length() - 4000) : text;
            }
        } catch (IOException ignored) {
            // sin log disponible
        }
        return "";
    }

    private static void stop() {
        synchronized (LOCK) {
            if (pgCtl != null && dataDir != null && Files.isDirectory(dataDir)) {
                try {
                    Process process = new ProcessBuilder(pgCtl, "-D", dataDir.toString(), "-m", "fast", "-w", "stop")
                            .redirectErrorStream(true)
                            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
                            .start();
                    process.waitFor(30, TimeUnit.SECONDS);
                } catch (Exception ignored) {
                    // El borrado posterior puede completar la limpieza.
                }
            }
            deleteRecursively(BASE_DIR);
            dataDir = null;
            logFile = null;
            processOutput = null;
            pgCtl = null;
            dataSource = null;
        }
    }

    private static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (var walk = Files.walk(root)) {
            List<Path> paths = new ArrayList<>(walk.sorted(Comparator.reverseOrder()).toList());
            for (Path path : paths) {
                for (int attempt = 0; attempt < 5; attempt++) {
                    try {
                        Files.deleteIfExists(path);
                        break;
                    } catch (IOException ex) {
                        if (attempt == 4) {
                            return;
                        }
                        try {
                            Thread.sleep(200);
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            return;
                        }
                    }
                }
            }
        } catch (IOException ignored) {
            // La limpieza no debe ocultar el resultado de las pruebas.
        }
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }
}
