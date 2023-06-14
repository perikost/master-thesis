const path = require('path');
const os = require('os');
const fs = require('fs');
const _ = require('lodash');
const { program, InvalidArgumentError } = require('commander');
const csv = require('./exploring-ethereum/helpers/csvModule')
const utils = require('./exploring-ethereum/helpers/utils')


function generateLatexTable(template, data) {
    // generate the table using the provided template and data
    const table = _.template(template)(data);

    return table;
}

function beautifyTable(table) {
    // Template may be copied from another platform and may have different line ending than the os 
    // Ensure that template always has \n as line ending
    if (os.EOL === '\r\n') {
        table = table.replace(os.EOL, '\n')
    }

    return table.split('\n').map(line => line.trim()).filter(line => !!line).join(os.EOL)
}


const HOST_LATENCY_TO_SIZE = {
    description: '',
    template: `
            % Please add the following required packages to your document preamble:
            % \\usepackage{booktabs}
            \\begin{table}
            \\caption{<%- title %>}
            \\begin{tabular}{@{}l<%- _.repeat('c', sizePoints.length)%>c@{}}
            \\toprule
            Host    & \\multicolumn{<%- sizePoints.length %>}{c}{Data Size}          & Sample Size \\\\ \\midrule
                    <% _.forEach(sizePoints, function(size) { %> & <%- size %> <% }); %>             \\\\ \\midrule
            <% _.forEach(data, function(row) { %>
            <%- row.host %> <% _.forEach(row.measurements, function(latency) { %> & <%- latency %> <% }); %> & <%- row.sampleSize %> \\\\
            <% }); %>
            \\bottomrule
            \\end{tabular}
            \\end{table}
        `,
    templateExpectedDataFormat: {
        data: [
            { host: 'Host1', measurements: ['latency_4kb', 'latency_16kb'], sampleSize: 3 },
            { host: 'Host2', measurements: ['latency_4kb', 'latency_16kb'], sampleSize: 8 },
        ],
        sizePoints: ['4kb', '16kb']
    },

    generate(root, sizePoints = ['4kb', '16kb', '64kb', '256kb', '1mb', '4mb', '16mb']) {
        const sizePointsInBytes = sizePoints.map(size => utils.core.byteSize(size))

        csv.applyToFiles(root, (file) => {
            csv.calculateAverageLatencyBySize(file)
        });

        csv.applyToDirectories(root, 'average-latency-by-size', (dir) => {
            const items = fs.readdirSync(dir);
            const data = []

            for (const item of items) {
                const itemPath = path.join(dir, item);

                if (path.parse(itemPath).ext === '.json') {
                    const { sampleSize, ...measurements } = JSON.parse(fs.readFileSync(itemPath, 'utf-8'));
                    const measurementsArray = sizePointsInBytes.map(size => measurements[size] && Math.round(Number(measurements[size])) || '-')
                    data.push({
                        sampleSize,
                        host: path.parse(itemPath).name.replace('.grid5000.fr', ''),
                        measurements: measurementsArray
                    })
                }
            }

            const title = `Table for experiment ${path.basename(path.dirname(dir))}`;
            const table = generateLatexTable(this.template, { data, sizePoints: sizePointsInBytes, title});

            fs.writeFileSync(path.join(dir, 'table.tex'), beautifyTable(table))
        })
    }
}

const TEMPLATES_MAP = {
    'host-latency-to-size': HOST_LATENCY_TO_SIZE
}

function parseTemplateOption(template) {
    if (!TEMPLATES_MAP.hasOwnProperty(template)) {
        throw new InvalidArgumentError(`Template must be one of: ${Object.keys(TEMPLATES_MAP).join(',')}.`);
    }
    return template;
}

function parseDirectoryOption(dir) {
    if (!fs.existsSync(dir)) {
        throw new InvalidArgumentError(`The directory must exist.`);
    }
    return dir;
}

program
    .option('-d, --directory [string]', 'The directory that contains the raw data (default: \'./csv_records\').', parseDirectoryOption, './csv_records')
    .option('-t, --template [string]', 'The template that will be applied (default: \'host-latency-to-size\').', parseTemplateOption, 'host-latency-to-size')

program.parse();



const { directory, template} = program.opts();

TEMPLATES_MAP[template].generate(directory)